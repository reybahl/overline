import { generateObject, generateText, Output, tool } from "ai";
import { z } from "zod";

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
import type {
  DomElement,
  ListInteractivesOptions,
  ListInteractivesResult,
  SearchInteractivesOptions,
} from "@/shared/types/dom";
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

const AGENT_TOOL_CALL_LIMIT = 6;
const AGENT_MAX_STEPS = AGENT_TOOL_CALL_LIMIT + 1;
const TOOL_RESULT_LIMIT = 20;

const SearchElementsToolSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Rough search terms from the user intent. Exact text is not required."),
  limit: z.number().int().min(1).max(TOOL_RESULT_LIMIT).optional(),
  controlKind: z.string().min(1).optional(),
});

const ListElementsToolSchema = z.object({
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(TOOL_RESULT_LIMIT).optional(),
  controlKind: z.string().min(1).optional(),
  toggleFirst: z.boolean().optional(),
});

export type RecorderElementLookup = {
  searchElements: (
    query: string,
    options?: SearchInteractivesOptions,
  ) => Promise<DomElement[]>;
  listElements: (
    options?: ListInteractivesOptions,
  ) => Promise<ListInteractivesResult>;
};

export class AgentTurnValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentTurnValidationError";
  }
}

const DOM_ELEMENT_RULES = [
  "- Each element has role, controlKind, idStable — use these to pick controls, not visible text alone",
  "- Duplicate labels (e.g. two \"Code\" elements): use controlKind — dropdown-trigger/disclosure for menus and dropdowns, nav-tab for repo section tabs, link for navigation",
  "- State fields show the result of prior clicks: selected/pressed/checked true or expanded true means that control is ALREADY active — do not click it again, move to the next part of the intent",
  "- Toggle controls: read ariaLabel and pressed/checked — click only the state that matches the intent (e.g. 'not viewed' → ariaLabel \"Not Viewed\" and pressed false). Never click the opposite state (Viewed, pressed true) — that hits the wrong file or undoes progress",
  "- For 'first matching state' intents (first not viewed, first unchecked): walk elements in listed order, skip non-matches, click the first match — not the expanded or topmost file section",
  "- Prefer selectors where idStable is true",
  "- If menu or panel items are missing from the page state, click the dropdown-trigger or disclosure that opens them first — do not give up",
];

const RECORD_AGENT_RULES = [
  "- Emit the single next action from the default context and retrieved search/list results toward the intent",
  "- The default context is intentionally small and is not the full page state",
  "- Use searchElements with rough terms from the intent — exact text is not required",
  "- You may call searchElements multiple times per turn with different queries — broaden, shorten, or rephrase if the first search misses",
  "- If searchElements returns nothing, try a broader or alternate query before listElements or waitFor",
  "- Use listElements only when search is too vague or repeated broader searches miss",
  "- Only use selectors returned by searchElements, listElements, or the default context; do not invent selectors",
  "- Search results with equal score are in document order — for first-match state intents, pick the first matching result",
  "- Use step types: click, type, fill, confirm, wait, waitFor, scroll",
  "- Never use navigate — click links and buttons instead",
  "- Never navigate backwards",
  "- Set done: true only when the intent is fully satisfied on the current page — not an intermediate stop",
  "- Never set done: true before recording at least one action",
  "- If a required control is missing, use waitFor — do not mark done or substitute unrelated controls",
  "- Take the fewest steps — do not click jump/anchor links to scroll to a control that is already in the DOM",
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
    "Default page context (small slice; use tools to search the full interactive index):",
    JSON.stringify(elements, null, 2),
    "",
    "Available tools:",
    "- searchElements({ query, limit?, controlKind? }): searches all indexed interactives with forgiving deterministic matching",
    "- listElements({ offset?, limit?, controlKind?, toggleFirst? }): browses a small page of indexed interactives",
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
    "- When recordedMatch.ariaLabel and recordedMatch.text differ, use ariaLabel only (state lives in aria, not visible label)",
    "- When recordedMatch.pressed or checked is set on a toggle, include it in the replay match",
    "",
    "Href (use THIS step's pageUrl + recordedMatch.hrefSuffix):",
    "- Bare /{segmentN} matching pageUrl segment N, no query → hrefFromPathSegment: N (no text)",
    "- Fragment/hash hrefSuffix (#…) → hrefContains with static # prefix through trailing hyphen; never hrefFromPathSegment",
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

function addAllowedSelectors(
  allowedSelectors: Set<string>,
  elements: DomElement[],
): void {
  for (const element of elements) {
    allowedSelectors.add(element.selector);
  }
}

function validateAgentTurnSelector(
  turn: AgentTurn,
  allowedSelectors: Set<string>,
): void {
  const selector = turn.step.selector;
  if (!selector || allowedSelectors.has(selector)) {
    return;
  }

  throw new AgentTurnValidationError(
    "The selected selector was not returned by default context, searchElements, or listElements. Search or list the target first, then use that exact selector.",
  );
}

function normalizeToolLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.floor(limit ?? TOOL_RESULT_LIMIT), 1), TOOL_RESULT_LIMIT);
}

function normalizeToolOffset(offset: number | undefined): number {
  return Math.max(Math.floor(offset ?? 0), 0);
}

function truncateLogValue(value: string | undefined, maxLength: number): string {
  if (!value) {
    return "";
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function summarizeElementsForLog(elements: DomElement[]): Record<string, unknown>[] {
  return elements.slice(0, 5).map((element) => ({
    selector: truncateLogValue(element.selector, 160),
    role: element.role,
    controlKind: element.controlKind,
    text: truncateLogValue(element.text, 120),
    ariaLabel: truncateLogValue(element.ariaLabel, 120),
  }));
}

function createRecorderTools(
  lookup: RecorderElementLookup,
  allowedSelectors: Set<string>,
) {
  let toolCallsUsed = 0;

  const reserveToolCall = (toolName: string): boolean => {
    if (toolCallsUsed >= AGENT_TOOL_CALL_LIMIT) {
      log.warn("recorder tool budget exhausted", { toolName });
      return false;
    }

    toolCallsUsed += 1;
    return true;
  };

  return {
    getToolCallsUsed: () => toolCallsUsed,
    tools: {
      searchElements: tool({
        description:
          "Search the full interactive DOM index with forgiving deterministic matching. Use rough terms; exact button or link text is not required.",
        parameters: SearchElementsToolSchema,
        execute: async (args) => {
          const limit = normalizeToolLimit(args.limit);

          if (!reserveToolCall("searchElements")) {
            return [];
          }

          log.info("recorder searchElements tool call", {
            query: args.query,
            limit,
            controlKind: args.controlKind,
            toolCallsUsed,
          });

          try {
            const elements = await lookup.searchElements(args.query, {
              limit,
              controlKind: args.controlKind,
            });
            addAllowedSelectors(allowedSelectors, elements);
            log.info("recorder searchElements tool result", {
              query: args.query,
              resultCount: elements.length,
              preview: summarizeElementsForLog(elements),
            });
            return elements;
          } catch (error) {
            log.warn("recorder searchElements tool failed", {
              query: args.query,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      }),
      listElements: tool({
        description:
          "Browse a small page of the full interactive DOM index when search is too vague. Equal-order results preserve document order unless toggleFirst is true.",
        parameters: ListElementsToolSchema,
        execute: async (args) => {
          const offset = normalizeToolOffset(args.offset);
          const limit = normalizeToolLimit(args.limit);

          if (!reserveToolCall("listElements")) {
            return {
              elements: [],
              total: 0,
              offset,
              limit,
            } satisfies ListInteractivesResult;
          }

          log.info("recorder listElements tool call", {
            offset,
            limit,
            controlKind: args.controlKind,
            toggleFirst: args.toggleFirst,
            toolCallsUsed,
          });

          try {
            const result = await lookup.listElements({
              offset,
              limit,
              controlKind: args.controlKind,
              toggleFirst: args.toggleFirst,
            });
            addAllowedSelectors(allowedSelectors, result.elements);
            log.info("recorder listElements tool result", {
              offset: result.offset,
              limit: result.limit,
              total: result.total,
              resultCount: result.elements.length,
              preview: summarizeElementsForLog(result.elements),
            });
            return result;
          } catch (error) {
            log.warn("recorder listElements tool failed", {
              offset,
              limit,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      }),
    },
  };
}

async function generateAgentTurnWithModels(
  prompt: string,
  elements: DomElement[],
  lookup: RecorderElementLookup,
): Promise<AgentTurn> {
  const env = getLlmEnv();
  if (!env) {
    throw new Error(`LLM not configured.\n${llmConfigHint()}`);
  }

  const models = buildModelFallbackChain(env.model);
  let lastError: unknown;

  for (const modelRef of models) {
    const allowedSelectors = new Set<string>();
    addAllowedSelectors(allowedSelectors, elements);
    const recorderTools = createRecorderTools(lookup, allowedSelectors);

    try {
      const result = await generateText({
        model: resolveLanguageModel(modelRef),
        prompt,
        tools: recorderTools.tools,
        maxSteps: AGENT_MAX_STEPS,
        experimental_output: Output.object({ schema: AgentTurnSchema }),
        experimental_prepareStep: async () =>
          recorderTools.getToolCallsUsed() >= AGENT_TOOL_CALL_LIMIT
            ? { toolChoice: "none" as const }
            : undefined,
      });
      const turn = AgentTurnSchema.parse(result.experimental_output);
      validateAgentTurnSelector(turn, allowedSelectors);
      return turn;
    } catch (error) {
      lastError = error;
      log.warn("agent model failed, trying next", {
        model: modelRef,
        toolCallsUsed: recorderTools.getToolCallsUsed(),
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
  lookup: RecorderElementLookup,
  lastError?: string,
): Promise<AgentTurn> {
  if (elements.length === 0) {
    throw new Error("No DOM elements captured on this page.");
  }

  const prompt = buildAgentTurnPrompt(intent, stepsSoFar, elements, url, lastError);

  return generateAgentTurnWithModels(prompt, elements, lookup);
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
