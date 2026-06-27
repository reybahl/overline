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
import {
  AgentTurnSchema,
  CompiledMacroOutputSchema,
  RunScopeSchema,
  type AgentTurn,
  type CompiledMacroOutput,
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
  "- Emit the single next action from the current page state toward the intent",
  "- Only use selectors from the current page state; do not invent selectors",
  "- Use step types: click, type, fill, confirm, wait, waitFor, scroll",
  "- Never use navigate — click links and buttons instead",
  "- Never navigate backwards",
  "- Set done: true only when the intent is fully satisfied on the current page — not an intermediate stop",
  "- Never set done: true before recording at least one action",
  "- If a required control is missing, use waitFor — do not mark done or substitute unrelated controls",
  ...DOM_ELEMENT_RULES,
];

const MACRO_NAME_RULE =
  "Use a short, readable title in plain English (2-5 words, Title Case) — " +
  'like a label a person would read, not a slug or identifier. ' +
  'Examples: "Copy GitHub Clone URL", "Open Issues Tab", "Save Billing Settings". ' +
  "Do not use kebab-case, snake_case, or abbreviations.";

const MACRO_DESCRIPTION_RULE =
  "One plain-English sentence describing what the macro does — not where it runs, " +
  "not the raw user intent, and not names/slugs/URLs from the recording session. " +
  'Use roles: "the owner", "the current repository". ' +
  'Examples: "Copies the HTTPS clone URL from the Code menu.", ' +
  '"Opens the followers list for the repository owner."';

function buildAgentTurnPrompt(
  intent: string,
  stepsSoFar: MacroGenerationStep[],
  elements: DomElement[],
  url: string,
  lastError?: string,
): string {
  const clickCount = stepsSoFar.filter((step) => step.type === "click").length;

  return [
    "You are recording a browser automation macro one step at a time.",
    "",
    `Intent: "${intent}"`,
    `Current URL: ${url}`,
    `Progress: ${clickCount} click(s) recorded`,
    `Steps so far: ${JSON.stringify(stepsSoFar)}`,
    lastError ? `Last step failed: ${lastError}` : "",
    "",
    "Current page state:",
    JSON.stringify(elements, null, 2),
    "",
    "What is the single next step?",
    ...RECORD_AGENT_RULES,
    `- When done: true, set macroName. ${MACRO_NAME_RULE}`,
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
    "Generalize the recorded demo into a replay script. Translate each demo step's recordedMatch — do not invent targets.",
    "",
    `Intent: "${intent}"`,
    `Started on: ${startUrl}`,
    `Ended on: ${endUrl}`,
    "",
    "Demo (pageUrl + recordedMatch per step):",
    JSON.stringify(demoScript, null, 2),
    "",
    "Return script (version 1) and description.",
    `- description: ${MACRO_DESCRIPTION_RULE}`,
    "",
    "Rules:",
    "- One output click/fill step per demo step — same count, same order",
    "- Generalize each recordedMatch; never add fields absent from that step's recordedMatch (especially testId)",
    "- Unstable ids (React useId, _r_*, long hex) → drop id; use text/textContains, ariaLabel, or href from same recordedMatch",
    "- Stable semantic ids → keep id",
    "- text with counts/badges → textContains with static words only",
    "",
    "Href (use THIS step's pageUrl + recordedMatch.hrefSuffix):",
    "- Bare /{segmentN} matching pageUrl segment N, no query → hrefFromPathSegment: N (no text)",
    "- Query tabs (?tab=…) → hrefPattern \\\\?tab=… (+ textContains if ambiguous)",
    "- Scoped paths (/org/repo/pulls) → hrefPattern preserving segment count",
    "- Never combine hrefFromPathSegment with hrefPattern or text fields",
    "",
    "Allowed: click, fill, wait, waitFor. Playback handles timing between steps — do not insert extra waitFor steps.",
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

  const prompt = buildAgentTurnPrompt(intent, stepsSoFar, elements, url, lastError);

  return generateObjectWithModels<AgentTurn>(AgentTurnSchema, prompt);
}

export async function compileMacroScript(
  intent: string,
  startUrl: string,
  endUrl: string,
  demoSteps: MacroStep[],
): Promise<CompiledMacroOutput> {
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
  const result = await generateObjectWithModels<CompiledMacroOutput>(
    CompiledMacroOutputSchema,
    prompt,
  );
  return {
    ...result,
    script: sanitizeCompiledScript(
      result.script,
      buildDemoScriptForCompile(demoSteps),
    ),
  };
}

function buildRunScopePrompt(
  intent: string,
  startUrl: string,
  endUrl: string,
  steps: MacroStep[],
): string {
  const firstStepPageUrl = steps.find((step) => step.pageUrl)?.pageUrl ?? startUrl;

  return [
    "Return a RegExp (string) for where this macro may START, plus a short description.",
    "One page type only — match startUrl / first step pageUrl, not endUrl.",
    "",
    `Intent: "${intent}"`,
    `Started on: ${startUrl}`,
    `First step pageUrl: ${firstStepPageUrl}`,
    `Ended on: ${endUrl}`,
    "",
    "Generalize slugs with [^/]+ but keep the same path segment count as the start URL.",
    "Example: started on /owner/repo → repo pages only, not bare /owner profile URLs.",
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
