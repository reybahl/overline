import { generateObject, generateText, Output, tool } from "ai";
import { z } from "zod";

import { applyInferredMacroSignature } from "@/shared/macro-signature";
import {
  finalizeInferredMacroSignature,
  validateMacroForSave,
} from "@/shared/macro-signature";
import {
  buildDemoScriptForCompile,
  sanitizeCompiledScript,
} from "@/shared/script-sanitize";
import { getLlmSettings } from "@/shared/clients/llm-settings";
import {
  LLM_NOT_CONFIGURED_MESSAGE,
  resolveLanguageModel,
} from "@/shared/llm";
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
  type Macro,
  type MacroGenerationStep,
  type MacroStep,
  type RunScope,
} from "@/shared/types/macro";
import {
  InferredMacroSignatureSchema,
  STANDALONE_MACRO_SIGNATURE,
  type MacroSignature,
} from "@/shared/types/macro-signature";
import type { MacroScript } from "@/shared/types/script";

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
  "- When the intent marks a value the user will provide at run time (on any site — issue #X, order ID, search query, filter text, etc.), use a realistic example visible on the current page so the demo completes",
  "- Never use {{placeholders}} in recorded step values or targets — always concrete demo literals",
  "- Pick demo values that actually work on this page (search returns results, the link opens, the item exists)",
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
    "- searchElements({ query, limit? }): searches all indexed interactives with forgiving deterministic matching",
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
    "- Stable semantic ids → keep id UNLESS intent marks that value as user-provided at run time (see below)",
    "- When intent marks a user-provided slot (numeric id, slug, search text, etc.) and recordedMatch has hrefSuffix/hrefContains/text with the demo literal: include that href/text field with the demo literal — do not rely on id alone when id embeds the literal (e.g. item_42_link)",
    "- text with counts/badges → textContains with static words only",
    "- When recordedMatch.ariaLabel and recordedMatch.text differ, use ariaLabel only (state lives in aria, not visible label)",
    "- When recordedMatch.pressed or checked is set on a toggle, include it in the replay match",
    "",
    "Href (use THIS step's pageUrl + recordedMatch.hrefSuffix):",
    "- Bare /{segmentN} matching pageUrl segment N, no query → hrefFromPathSegment: N (no text)",
    "- Fragment/hash hrefSuffix (#…) → hrefContains with static # prefix through trailing hyphen; never hrefFromPathSegment",
    "- Query tabs (?tab=…) → hrefPattern \\\\?tab=… (+ textContains if ambiguous)",
    "- Scoped paths (/org/project/items) → hrefPattern preserving segment count",
    "- Never combine hrefFromPathSegment with hrefPattern or text fields",
    "",
    "Allowed: click, fill, wait, waitFor. Playback handles timing between steps — do not insert extra waitFor steps.",
    "- Keep demo literals in fill values and match fields for user-provided intent slots — do not replace them with open regexes (e.g. /items/\\\\d+)",
    "- Runtime parameterization ({{param}} templates) is applied in a later pass",
  ].join("\n");
}

const MACRO_SIGNATURE_RULES = [
  "You are defining the function signature for a browser macro script template.",
  "",
  "Return standalone: false when the intent EXPLICITLY says the user will supply a value at run time.",
  'Explicit signals include: "I give you", "I will input", "as input", "at playback", "each run", "user provides", "where X is".',
  "When those signals are present AND a demo/compiled field contains the example literal, you MUST return standalone: false with params and patches.",
  "",
  "Return standalone: true ONLY when:",
  "- Intent describes a fixed action with no user-supplied slot, OR",
  "- Intent mentions a user slot but no compiled or recordedMatch field contains the demo literal to template",
  "",
  "Never infer params from demo values alone when intent does not mark them as user-provided.",
];

const MACRO_SIGNATURE_PATCH_RULES = [
  "patches replace one script field with a template containing {{paramName}}",
  "Allowed fields: value (fill only), match.id, match.ariaLabel, match.text, match.textContains, match.hrefSuffix, match.hrefContains, match.hrefPattern",
  "template is the FULL new string for that field",
  "Correlate the demo literal from recordedMatch or fill value with the param named in intent (item number → itemNumber, search text → searchTerm)",
  "When recordedMatch has hrefSuffix/hrefContains with the demo literal, prefer match.hrefContains or match.hrefSuffix over match.id",
  "When compiled script only has match.id embedding the demo literal, template the literal portion: e.g. item_{{itemNumber}}_link",
  "Every declared param must appear in at least one patch template",
];

const MACRO_SIGNATURE_EXAMPLE = [
  "Example A — intent: \"open item #N where N is the number I give you\" (works on any site with numeric item links)",
  "Compiled step 0: { type: \"click\", match: { id: \"item_42_link\" } }",
  "Demo recordedMatch: { hrefSuffix: \"/items/42\", ... }",
  "Correct output:",
  JSON.stringify(
    {
      standalone: false,
      params: [
        {
          name: "itemNumber",
          label: "Item number",
          type: "number",
          description: "Numeric id of the item to open",
        },
      ],
      patches: [
        {
          stepIndex: 0,
          field: "match.hrefContains",
          template: "/items/{{itemNumber}}",
        },
      ],
    },
    null,
    2,
  ),
  "Alternate when href is absent from recordedMatch: patch match.id to embed {{paramName}} where the demo literal was",
  "",
  "Example B — intent: \"search for TERM where TERM is something I type each run\"",
  "Patch fill value to \"{{searchTerm}}\"",
];

function summarizeScriptForSignature(script: MacroScript): Record<string, unknown>[] {
  return script.steps.map((step, stepIndex) => {
    const base = { stepIndex, type: step.type, ...(step.label ? { label: step.label } : {}) };

    switch (step.type) {
      case "fill":
        return { ...base, value: step.value, match: step.match };
      case "click":
        return { ...base, match: step.match, ...(step.index ? { index: step.index } : {}) };
      case "waitFor":
        return { ...base, match: step.match };
      case "wait":
        return { ...base, ms: step.ms };
      default: {
        const _exhaustive: never = step;
        return { stepIndex, type: String(_exhaustive) };
      }
    }
  });
}

function buildMacroSignaturePrompt(
  intent: string,
  script: MacroScript,
  demoSteps: MacroStep[],
): string {
  const demoScript = buildDemoScriptForCompile(demoSteps);

  return [
    ...MACRO_SIGNATURE_RULES,
    "",
    `Intent: "${intent}"`,
    "",
    "Compiled script (stepIndex + field for patches):",
    JSON.stringify(summarizeScriptForSignature(script), null, 2),
    "",
    "Demo steps (recorded literals + recordedMatch — use to find which field holds the demo literal):",
    JSON.stringify(demoScript, null, 2),
    "",
    "Patch rules:",
    ...MACRO_SIGNATURE_PATCH_RULES.map((rule) => `- ${rule}`),
    "",
    ...MACRO_SIGNATURE_EXAMPLE,
    "",
    "Return standalone, params, and patches.",
  ].join("\n");
}

async function generateObjectWithModels<T>(
  schema: z.ZodType<T>,
  prompt: string,
): Promise<T> {
  const settings = await getLlmSettings();
  if (!settings) {
    throw new Error(LLM_NOT_CONFIGURED_MESSAGE);
  }

  const result = await generateObject({
    model: resolveLanguageModel(settings),
    schema,
    prompt,
  });
  return result.object as T;
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
          "Search the full interactive DOM index with forgiving deterministic matching. Use rough terms; exact button or link text is not required. Search always covers every indexed control kind.",
        parameters: SearchElementsToolSchema,
        execute: async (args) => {
          const limit = normalizeToolLimit(args.limit);

          if (!reserveToolCall("searchElements")) {
            return [];
          }

          log.info("recorder searchElements tool call", {
            query: args.query,
            limit,
            toolCallsUsed,
          });

          try {
            const elements = await lookup.searchElements(args.query, {
              limit,
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
  const settings = await getLlmSettings();
  if (!settings) {
    throw new Error(LLM_NOT_CONFIGURED_MESSAGE);
  }

  const allowedSelectors = new Set<string>();
  addAllowedSelectors(allowedSelectors, elements);
  const recorderTools = createRecorderTools(lookup, allowedSelectors);

  const result = await generateText({
    model: resolveLanguageModel(settings),
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

export type InferredMacroSignatureResult = {
  script: MacroScript;
  signature: MacroSignature;
};

export async function inferMacroSignature(
  intent: string,
  script: MacroScript,
  demoSteps: MacroStep[],
): Promise<InferredMacroSignatureResult> {
  const prompt = buildMacroSignaturePrompt(intent, script, demoSteps);

  try {
    let inferred = await generateObjectWithModels(
      InferredMacroSignatureSchema,
      prompt,
    );
    let applied = applyInferredMacroSignature(script, inferred);

    let validationError = validateMacroForSave({
      script: applied.script,
      signature: applied.signature,
    } as Macro);

    if (validationError && !inferred.standalone && inferred.params.length > 0) {
      log.warn("macro signature inference invalid, retrying", {
        error: validationError,
      });
      const retryPrompt = [
        prompt,
        "",
        `Your previous output was invalid: ${validationError}`,
        "Return corrected standalone, params, and patches.",
      ].join("\n");
      inferred = await generateObjectWithModels(
        InferredMacroSignatureSchema,
        retryPrompt,
      );
      applied = applyInferredMacroSignature(script, inferred);
      validationError = validateMacroForSave({
        script: applied.script,
        signature: applied.signature,
      } as Macro);
      if (validationError) {
        log.warn("macro signature inference retry still invalid", {
          error: validationError,
        });
      }
    }

    const finalized = finalizeInferredMacroSignature(script, applied);
    log.info("macro signature inferred", {
      standalone: inferred.standalone,
      paramCount: finalized.signature.params.length,
      patchCount: inferred.patches.length,
      ...(finalized.signature.params.length > 0
        ? {
            params: inferred.params.map((param) => param.name),
            patches: inferred.patches,
          }
        : {}),
    });
    return finalized;
  } catch (error) {
    log.warn("macro signature inference failed, using standalone", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { script, signature: STANDALONE_MACRO_SIGNATURE };
  }
}
