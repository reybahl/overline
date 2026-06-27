import { generateObject } from "ai";
import type { z } from "zod";

import type { DomElement } from "@/content/dom-capture";
import {
  buildDemoScriptForCompile,
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
  RunScopeSchema,
  type AgentTurn,
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

const MACRO_NAME_RULE =
  "Use a short, readable title in plain English (2-5 words, Title Case) — " +
  'like a label a person would read, not a slug or identifier. ' +
  'Examples: "Copy GitHub Clone URL", "Open Issues Tab", "Save Billing Settings". ' +
  "Do not use kebab-case, snake_case, or abbreviations.";

const MACRO_DESCRIPTION_RULE =
  "One plain-English sentence describing what the macro does — not where it runs, " +
  'not the raw user intent. Examples: "Copies the HTTPS clone URL from the Code menu.", ' +
  '"Opens the Issues tab on the current repository."';

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
    "What is the single next step to take?",
    "Rules:",
    "- Never set done: true when steps taken so far is empty — you must record at least one action first",
    "- Set done: true only when the intent is fully satisfied (check selected/pressed state and URL, not URL alone)",
    "- For multi-step intents (e.g. \"go to X then Y\"), set done: true once the final destination is reached",
    ...RECORD_AGENT_RULES,
    `- When done: true, set macroName. ${MACRO_NAME_RULE}`,
    `- When done: true, set macroDescription. ${MACRO_DESCRIPTION_RULE}`,
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
  const demoScript = buildDemoScriptForCompile(demoSteps);

  return [
    "You generalize a recorded browser automation demo into a replay script.",
    "Your job is a translator: convert each demo step's specific recordedMatch into a durable match for future runs.",
    "Do NOT discover targets from scratch — every output step must correspond to one demo step below.",
    "",
    `User intent: "${intent}"`,
    `Recording started on: ${startUrl}`,
    `Recording ended on: ${endUrl}`,
    "",
    "Demo script (specific matches captured at click time — your input):",
    JSON.stringify(demoScript, null, 2),
    "",
    "Return a script with version 1 and an ordered steps array.",
    "",
    "Role (critical):",
    "- One output step per demo step, same order — do not add, drop, or merge steps",
    "- Each output match must generalize the corresponding demo recordedMatch — never invent unrelated ids, tags, or text",
    "- Visible text with dynamic counts/badges → use textContains with static label words only, not the full string with numbers",
    "- hrefSuffix with instance-specific paths → generalize to hrefContains or hrefPattern when intent implies any similar item (e.g. latest row: hrefPattern + index 0)",
    "- When intent names a specific item (e.g. switch to main), keep a specific match — do not over-generalize",
    "",
    "Element id stability (critical):",
    "- recordedMatch.id may be an auto-generated framework id that will NOT exist on replay",
    "- UNSTABLE ids — omit match.id; generalize from other fields on the SAME recordedMatch:",
    "  React useId (_r_*, :r*:), React Aria, Radix, Headless UI prefixes, long hex/uuid blobs, ids with no readable words",
    "- STABLE ids — keep match.id unchanged; do not replace with ambiguous visible text:",
    "  semantic kebab-case/snake_case names (ref-picker-repos-header-ref-selector, js-issues-search, pull-requests-tab)",
    "- When recordedMatch.id looks unstable: use text, textContains, testId, ariaLabel, or href from that same recordedMatch — never invent text absent from recordedMatch",
    "- When recordedMatch.id looks stable: keep match.id even if visible text exists (e.g. branch button labeled \"test\")",
    "- If recordedMatch has only an unstable id and no other fields, keep match.id as last resort",
    "",
    "Allowed transforms on recordedMatch:",
    "- id → id (only when stable semantic id)",
    "- unstable id → text, textContains, testId, ariaLabel, or hrefContains/hrefPattern from the same recordedMatch",
    "- text → textContains (strip volatile counts/badges)",
    "- hrefSuffix → hrefContains or hrefPattern; add index: 0 for first/latest/top when intent requires it",
    "- testId → testId (unchanged)",
    "",
    "Forbidden:",
    "- Adding steps not present in the demo script",
    "- match fields that do not generalize from that step's recordedMatch",
    "- Using tag when recordedMatch had no tag and text/id/href already identify the target",
    "- waitFor on a different target than the next click's match",
    "",
    "Allowed step types:",
    '- click: { type: "click", label?, match: { id?, tag?, ariaLabel?, text?, textContains?, hrefSuffix?, hrefContains?, hrefPattern?, testId? }, index?: 0 }',
    '- fill: { type: "fill", label?, match: {...}, value: "..." }',
    '- wait: { type: "wait", label?, ms: number }',
    `- waitFor: { type: "waitFor", label?, match: {...}, timeoutMs?: ${DEFAULT_SCRIPT_WAIT_FOR_MS} }`,
    "",
    "Multi-step flows:",
    "- After opening a dropdown or panel, you may insert waitFor before the next click",
    "- waitFor match must equal the next click's match",
    `- Prefer click → waitFor → click when needed; timeoutMs ${DEFAULT_SCRIPT_WAIT_FOR_MS}`,
    "",
    "Labels: short description of which part of the intent each step fulfills.",
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
  const missingMatches = demoSteps.filter(
    (step) =>
      (step.type === "click" || step.type === "fill") && !step.recordedMatch,
  );
  if (missingMatches.length > 0) {
    log.warn("demo steps missing recordedMatch", {
      count: missingMatches.length,
    });
  }

  const prompt = buildCompileScriptPrompt(intent, startUrl, endUrl, demoSteps);
  const script = await generateObjectWithModels<MacroScript>(
    MacroScriptSchema,
    prompt,
  );
  return sanitizeCompiledScript(script);
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
