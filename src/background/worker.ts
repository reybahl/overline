import { generateObject } from "ai";
import type { z } from "zod";

import type { DomElement } from "@/content/dom-capture";
import {
  buildDemoElementHints,
  sanitizeCompiledScript,
} from "@/shared/script-sanitize";
import { getLlmEnv, llmConfigHint } from "@/shared/env";
import {
  buildModelFallbackChain,
  resolveLanguageModel,
} from "@/shared/llm-model";
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

const log = createLogger("llm");

const DOM_ELEMENT_RULES = [
  "- Each element has role, controlKind, idStable — use these to pick controls, not visible text alone",
  "- Duplicate labels (e.g. two \"Code\" elements): use controlKind — dropdown-trigger/disclosure for menus and dropdowns, nav-tab for repo section tabs, link for navigation",
  "- State fields show the result of prior clicks: selected/pressed/checked true or expanded true means that control is ALREADY active — do not click it again, move to the next part of the intent",
  "- Prefer selectors where idStable is true",
  "- If menu or panel items are missing from the page state, click the dropdown-trigger or disclosure that opens them first — do not give up",
];

const RECORD_AGENT_RULES = [
  "- Only use selectors from the current page state",
  "- Do not invent selectors",
  "- Match the intent literally step by step — do not click unrelated controls to guess the next action",
  "- Use step types: click, type, fill, confirm, wait, waitFor, scroll",
  "- Never use the navigate step type — click links and buttons instead",
  "- For wait, put milliseconds in value",
  "- For waitFor, put selector and timeout ms in value",
  "- Never navigate backwards — do not click a link that returns to a page you already visited",
  "- If the intent is already complete, return done: true and do not emit another step",
  "- If a required control is missing from page state, use waitFor for it — do not substitute a different button and do not mark done",
  ...DOM_ELEMENT_RULES,
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
    "- Prefer stable selectors (idStable: true) from the element list",
    ...DOM_ELEMENT_RULES,
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
  referenceElements: DomElement[],
): string {
  const demoHints = buildDemoElementHints(demoSteps, referenceElements);

  return [
    "You compile a browser automation demo into a generalized click-based script that runs deterministically on similar pages.",
    "",
    `User intent: "${intent}"`,
    `Recording started on: ${startUrl}`,
    `Recording ended on: ${endUrl}`,
    `Demo steps (brittle — do not copy unstable ids): ${JSON.stringify(
      demoSteps.map((step) => ({
        type: step.type,
        selector: step.selector,
        value: step.value,
      })),
    )}`,
    "",
    "Demo steps resolved against reference DOM (USE THIS — do not invent fields):",
    JSON.stringify(demoHints, null, 2),
    "",
    "Reference DOM at compile time (only use values that appear here):",
    JSON.stringify(referenceElements, null, 2),
    "",
    "Return a script with version 1 and an ordered steps array.",
    "",
    "Anti-hallucination rules (critical):",
    "- NEVER put ariaLabel in a match unless resolvedElement.ariaLabel or reference DOM ariaLabel is non-empty for that control",
    "- If a control only has text (ariaLabel empty), use match.text — NOT match.ariaLabel",
    "- NEVER invent id, testId, ariaLabel, or text that is not shown in reference DOM or demo hints",
    "- Duplicate visible labels (e.g. two \"Code\" controls): use tag + text + controlKind — nav-tab is role link on #code-tab, dropdown is tag button with controlKind dropdown-trigger",
    "- For dropdown/menu intents: click tag button with text, NOT #code-tab and NOT ariaLabel unless present in DOM",
    "- waitFor must target the NEXT menu item or panel content you will click — NOT the same match as the dropdown trigger you just clicked",
    "- id values must be bare element ids (e.g. issues-tab) — never prefix with #",
    "- Only add script steps that correspond to demo actions or intent clauses you can ground in reference DOM",
    "",
    "Critical: the script must implement EVERY part of the user intent, in order.",
    "If the intent says \"go to issues, then click the latest issue\", the script must have:",
    "  1) a step that opens the Issues section/tab,",
    "  2) a step that clicks the first/top issue in that list (index 0), using a match for issue rows — not nav links.",
    "Add a short label on each step describing which part of the intent it fulfills.",
    "",
    "Allowed step types (clicks only — no navigate steps):",
    '- click: { type: "click", label?, match: { id?, tag?, ariaLabel?, text?, textContains?, hrefSuffix?, hrefContains?, hrefPattern?, testId? }, index?: 0 }',
    "  · tag may be clipboard-copy for <clipboard-copy> custom elements",
    "  · index 0 = first matching element (use for latest/first/top item in a list after reaching the list page).",
    "  · id: ONLY when idStable is true in reference DOM (e.g. issues-tab). Never use unstable React ids (_R_…). Never prefix id with #.",
    "  · hrefPattern: regex on href path, e.g. \"/issues/\\\\d+\" matches issue links but not the Issues tab (/issues with no number).",
    "  · testId: data-testid when present in reference DOM.",
    "  · Match priority: stable id > testId > ariaLabel (if non-empty in DOM) > text > hrefPattern",
    "  · For repo section tabs: match.id from stable ids like issues-tab",
    "  · For dropdown triggers: match.tag \"button\" + match.text from reference DOM",
    '- fill: { type: "fill", label?, match: {...}, value: "..." }',
    '- wait: { type: "wait", label?, ms: 500 }',
    `- waitFor: { type: "waitFor", label?, match: {...}, timeoutMs?: ${DEFAULT_SCRIPT_WAIT_FOR_MS} }`,
    "",
    "Reliability (required for multi-step flows):",
    "- After opening a dropdown or panel, insert waitFor for the NEXT click target (e.g. CLI tab), not the trigger button",
    `- Prefer click → waitFor → click; use timeoutMs ${DEFAULT_SCRIPT_WAIT_FOR_MS}`,
    "",
    "Rules:",
    "- Never emit navigate steps — click links and buttons instead",
    "- One script step per logical intent clause",
    "- Generalize: strip instance-specific issue/PR numbers unless the intent names them",
    "- Never use hrefContains \"/issues/\" alone for the final click — use hrefPattern \"/issues/\\\\d+\"",
    "- Labels must describe the intent part",
    "- Keep the script minimal",
    "- Each match object must include at least one matching criterion that exists in reference DOM",
  ].join("\n");
}

async function generateObjectWithModels<T>(
  schema: z.ZodType<T>,
  prompt: string,
): Promise<T> {
  const env = getLlmEnv();
  if (!env) {
    throw new Error(`LLM not configured.\n${llmConfigHint()}`);
  }

  const models = buildModelFallbackChain(env.model);
  let lastError: unknown;

  for (const modelRef of models) {
    try {
      const result = await generateObject({
        model: resolveLanguageModel(modelRef),
        schema,
        prompt,
      });
      return result.object as T;
    } catch (error) {
      lastError = error;
      log.warn("model failed, trying next", {
        model: modelRef,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All configured models failed.");
}

async function generateWithModel(
  modelRef: string,
  prompt: string,
  url: string,
): Promise<Macro> {
  const result = await generateObject({
    model: resolveLanguageModel(modelRef),
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
  referenceElements: DomElement[],
): Promise<MacroScript> {
  const prompt = buildCompileScriptPrompt(
    intent,
    startUrl,
    endUrl,
    demoSteps,
    referenceElements,
  );
  const script = await generateObjectWithModels<MacroScript>(
    MacroScriptSchema,
    prompt,
  );
  return sanitizeCompiledScript(script, referenceElements, demoSteps);
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
    throw new Error(`LLM not configured.\n${llmConfigHint()}`);
  }

  if (elements.length === 0) {
    throw new Error("No DOM elements captured. Run Capture DOM first.");
  }

  const prompt = buildSingleShotPrompt(intent, elements, url);
  const models = buildModelFallbackChain(env.model);
  let lastError: unknown;

  for (const modelRef of models) {
    try {
      return await generateWithModel(modelRef, prompt, url);
    } catch (error) {
      lastError = error;
      log.warn("model failed, trying next", {
        model: modelRef,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All configured models failed to generate a macro.");
}
