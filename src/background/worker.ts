import { createGroq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import type { z } from "zod";

import type { DomElement } from "@/content/dom-capture";
import { getLlmEnv } from "@/shared/env";
import { createLogger } from "@/shared/logger";
import { DEFAULT_SCRIPT_WAIT_FOR_MS } from "@/shared/timing";
import { MacroScriptSchema, type MacroScript } from "@/shared/types/script";
import {
  AgentTurnSchema,
  MacroGenerationSchema,
  RunScopeSchema,
  toMacro,
  type AgentTurn,
  type Macro,
  type MacroGenerationStep,
  type MacroStep,
  type RunScope,
} from "@/shared/types/macro";

const PRIMARY_MODEL = "gpt-oss-20b";
const FALLBACK_MODEL = "llama-3.3-70b-versatile";

const log = createLogger("llm");

const RECORD_AGENT_RULES = [
  "- Only use selectors from the current page state",
  "- Do not invent selectors",
  "- Use step types: click, type, fill, confirm, wait, waitFor, scroll",
  "- Never use the navigate step type — click links and buttons instead",
  "- For wait, put milliseconds in value",
  "- For waitFor, put selector and timeout ms in value",
  "- Never navigate backwards — do not click a link that returns to a page you already visited",
  "- If the intent is already complete, return done: true and do not emit another step",
  "- If the intent cannot be completed, set done: true and explain in reasoning",
];

function buildSingleShotPrompt(
  intent: string,
  elements: DomElement[],
  url: string,
): string {
  return [
    "You generate browser automation macros for a Chrome extension.",
    "",
    `Current URL: ${url}`,
    `User intent: ${intent}`,
    "",
    "Available DOM elements (JSON):",
    JSON.stringify(elements, null, 2),
    "",
    "Return a macro that accomplishes the intent using only the listed elements.",
    "Rules:",
    "- Use only step types: click, type, fill, confirm, navigate, wait, waitFor, scroll",
    "- Prefer stable selectors from the element list",
    "- For type/fill steps, put the text to enter in value",
    "- For click steps, use selector from the matching element",
    "- For wait steps, put milliseconds in value as a string (e.g. \"500\")",
    "- For waitFor steps, put timeout milliseconds in value and selector to wait for",
    "- Keep steps minimal and ordered",
    "- Name the macro concisely",
  ].join("\n");
}

function buildAgentTurnPrompt(
  intent: string,
  stepsSoFar: MacroGenerationStep[],
  elements: DomElement[],
  url: string,
  lastError?: string,
): string {
  return [
    "You are recording a browser automation macro one step at a time.",
    "",
    `Original intent: "${intent}"`,
    `Current URL: ${url}`,
    `Steps taken so far: ${JSON.stringify(stepsSoFar)}`,
    lastError ? `Last step failed: ${lastError}` : "",
    "",
    "Current page state:",
    JSON.stringify(elements, null, 2),
    "",
    "What is the single next step to take? Check Current URL first — set done: true if the intent is already satisfied.",
    "Rules:",
    "- For multi-step intents (e.g. \"go to X then Y\"), set done: true once the final destination is reached",
    ...RECORD_AGENT_RULES,
    "- When done: true, optionally set macroName to a short name for the macro",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCompileScriptPrompt(
  intent: string,
  startUrl: string,
  endUrl: string,
  demoSteps: MacroStep[],
): string {
  return [
    "You compile a browser automation demo into a generalized click-based script that runs deterministically on similar pages.",
    "",
    `User intent: "${intent}"`,
    `Recording started on: ${startUrl}`,
    `Recording ended on: ${endUrl}`,
    `Demo steps (brittle — do not copy ids or instance-specific selectors): ${JSON.stringify(
      demoSteps.map((step) => ({
        type: step.type,
        selector: step.selector,
        value: step.value,
      })),
    )}`,
    "",
    "Return a script with version 1 and an ordered steps array.",
    "",
    "Critical: the script must implement EVERY part of the user intent, in order.",
    "If the intent says \"go to issues, then click the latest issue\", the script must have:",
    "  1) a step that opens the Issues section/tab,",
    "  2) a step that clicks the first/top issue in that list (index 0), using a match for issue rows — not nav links.",
    "Add a short label on each step describing which part of the intent it fulfills.",
    "",
    "Allowed step types (clicks only — no navigate steps):",
    '- click: { type: "click", label?, match: { id?, tag?, ariaLabel?, text?, textContains?, hrefSuffix?, hrefContains?, hrefPattern?, testId? }, index?: 0 }',
    "  · index 0 = first matching element (use for latest/first/top item in a list after reaching the list page).",
    "  · id: stable element id when demo used #issues-tab → id \"issues-tab\" (same across repos on a site).",
    "  · hrefPattern: regex on href path, e.g. \"/issues/\\\\d+\" matches issue links but not the Issues tab (/issues with no number).",
    "  · testId: data-testid when stable in the demo (e.g. issue-pr-title-link).",
    "  · For repo/section tabs, prefer match.id (from demo #issues-tab), then ariaLabel, then text",
    '- fill: { type: "fill", label?, match: {...}, value: "..." }',
    '- wait: { type: "wait", label?, ms: 500 }',
    `- waitFor: { type: "waitFor", label?, match: {...}, timeoutMs?: ${DEFAULT_SCRIPT_WAIT_FOR_MS} }`,
    "",
    "Reliability (required for multi-step flows):",
    "- After any click that navigates to a new page or section, insert a waitFor before the next click",
    "- Use the same match as the upcoming click (or a distinctive element on the target page)",
    `- Prefer click → waitFor → click rather than back-to-back clicks; use timeoutMs ${DEFAULT_SCRIPT_WAIT_FOR_MS} on slow networks`,
    "",
    "Rules:",
    "- Never emit navigate steps — click links and buttons instead",
    "- One script step per logical intent clause (\"go to X\" then \"click Y\" → at least 2 steps)",
    "- Generalize: strip instance-specific issue/PR numbers unless the intent names them",
    "- For latest/first/top item: navigate to the list first, then click with index 0 and hrefPattern or testId that matches list rows only",
    "- Never use hrefContains \"/issues/\" alone for the final click — it matches nav and sidebar. Use hrefPattern \"/issues/\\\\d+\" or a stable testId from the demo",
    "- Labels must describe the intent part (e.g. \"Open Issues tab\", \"Click first issue in list\")",
    "- Keep the script minimal",
    "- Each match object must include at least one matching criterion",
  ].join("\n");
}

async function generateObjectWithModels<T>(
  schema: z.ZodType<T>,
  prompt: string,
): Promise<T> {
  const env = getLlmEnv();
  if (!env) {
    throw new Error(
      "LLM not configured. Set VITE_GROQ_API_KEY and VITE_GROQ_MODEL in .env.",
    );
  }

  const models = [...new Set([env.model, PRIMARY_MODEL, FALLBACK_MODEL])];
  let lastError: unknown;

  for (const model of models) {
    try {
      const groq = createGroq({ apiKey: env.apiKey });
      const result = await generateObject({
        model: groq(model),
        schema,
        prompt,
      });
      return result.object as T;
    } catch (error) {
      lastError = error;
      log.warn("model failed, trying next", {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Groq models failed.");
}

async function generateWithModel(
  apiKey: string,
  model: string,
  prompt: string,
  url: string,
): Promise<Macro> {
  const groq = createGroq({ apiKey });
  const result = await generateObject({
    model: groq(model),
    schema: MacroGenerationSchema,
    prompt,
  });

  return toMacro(result.object, url);
}

export async function getNextStep(
  intent: string,
  stepsSoFar: MacroGenerationStep[],
  elements: DomElement[],
  url: string,
  lastError?: string,
): Promise<AgentTurn> {
  if (elements.length === 0) {
    throw new Error("No DOM elements captured on this page.");
  }

  const prompt = buildAgentTurnPrompt(
    intent,
    stepsSoFar,
    elements,
    url,
    lastError,
  );

  return generateObjectWithModels<AgentTurn>(AgentTurnSchema, prompt);
}

export async function compileMacroScript(
  intent: string,
  startUrl: string,
  endUrl: string,
  demoSteps: MacroStep[],
): Promise<MacroScript> {
  const prompt = buildCompileScriptPrompt(intent, startUrl, endUrl, demoSteps);
  return generateObjectWithModels<MacroScript>(MacroScriptSchema, prompt);
}

function buildRunScopePrompt(
  intent: string,
  startUrl: string,
  endUrl: string,
  steps: MacroStep[],
): string {
  return [
    "You decide where a browser automation macro should be allowed to run.",
    "",
    `User intent: "${intent}"`,
    `Recording started on: ${startUrl}`,
    `Recording ended on: ${endUrl}`,
    `Recorded steps: ${JSON.stringify(
      steps.map((step) => ({
        type: step.type,
        selector: step.selector,
        value: step.value,
      })),
    )}`,
    "",
    "Return a JavaScript RegExp pattern (as a string) tested against the full page URL.",
    "Also return a short plain-English description for the user.",
    "",
    "Critical: the pattern must match pages where the user STARTS this macro (the start URL),",
    "not only the destination after steps finish. endUrl is where the macro navigates to;",
    "do not require the tab to already be on endUrl before running.",
    "",
    "Rules:",
    "- Generalize when the intent is site navigation (e.g. open a tab/section) — match any similar starting page, not one specific account or slug",
    "- Keep narrow when the intent is page-specific (e.g. fill this form on this page)",
    "- Escape regex metacharacters in literal URL segments (., ?, etc.)",
    "- Prefer anchoring with ^ and $",
    "- Generalize path segments that vary (owners, ids, slugs) with [^/]+ when intent is not page-specific",
    "- Example for a dynamic section: ^https://example\\.com/accounts/[^/]+(?:/.*)?$",
    "- Example for one exact page: ^https://example\\.com/path(?:[/?#].*)?$",
    "- Do not match unrelated sites",
  ].join("\n");
}

export async function inferRunScope(
  intent: string,
  startUrl: string,
  endUrl: string,
  steps: MacroStep[],
): Promise<RunScope> {
  const prompt = buildRunScopePrompt(intent, startUrl, endUrl, steps);
  return generateObjectWithModels(RunScopeSchema, prompt);
}

export async function generateMacro(
  intent: string,
  elements: DomElement[],
  url: string,
): Promise<Macro> {
  const env = getLlmEnv();
  if (!env) {
    throw new Error(
      "LLM not configured. Set VITE_GROQ_API_KEY and VITE_GROQ_MODEL in .env.",
    );
  }

  if (elements.length === 0) {
    throw new Error("No DOM elements captured. Run Capture DOM first.");
  }

  const prompt = buildSingleShotPrompt(intent, elements, url);
  const models = [...new Set([env.model, PRIMARY_MODEL, FALLBACK_MODEL])];
  let lastError: unknown;

  for (const model of models) {
    try {
      return await generateWithModel(env.apiKey, model, prompt, url);
    } catch (error) {
      lastError = error;
      log.warn("model failed, trying next", {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Groq models failed to generate a macro.");
}
