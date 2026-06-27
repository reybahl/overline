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
import {
  AgentTurnSchema,
  CompiledMacroOutputSchema,
  RecordingPlanSchema,
  RunScopeSchema,
  type AgentTurn,
  type CompiledMacroOutput,
  type MacroGenerationStep,
  type MacroStep,
  type RecordingPlan,
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
  "- Keep plan.goal in mind — emit the single next action that advances from the current page state",
  "- Only use selectors from the current page state",
  "- Do not invent selectors",
  "- Use step types: click, type, fill, confirm, wait, waitFor, scroll",
  "- Never use the navigate step type — click links and buttons instead",
  "- For wait, put milliseconds in value",
  "- For waitFor, put selector and timeout ms in value",
  "- Never navigate backwards — do not click a link that returns to a page you already visited",
  "- Set done: true only when plan.goal is clearly reached on the current page — not at an intermediate stop",
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
  "not the raw user intent, and not names/slugs/URLs from the recording session. " +
  'Use roles: "the owner", "the current repository". ' +
  'Examples: "Copies the HTTPS clone URL from the Code menu.", ' +
  '"Opens the followers list for the repository owner."';

function buildRecordingPlanPrompt(intent: string): string {
  return [
    "Rewrite the user intent as one sentence describing the end state when the task is fully complete.",
    "This is a reminder for the recorder — not a step list, not avoid rules, not success checks.",
    "",
    `User intent: "${intent}"`,
    "",
    "Return: { goal: \"...\" }",
    "- Describe the destination/outcome, not the first click",
    "- No usernames, repo names, or URLs from a specific session — keep it general where possible",
  ].join("\n");
}

function buildAgentTurnPrompt(
  intent: string,
  plan: RecordingPlan,
  stepsSoFar: MacroGenerationStep[],
  elements: DomElement[],
  url: string,
  lastError?: string,
): string {
  const clickCount = stepsSoFar.filter((step) => step.type === "click").length;

  return [
    "You are recording a browser automation macro one step at a time.",
    "Keep plan.goal in mind while choosing each next action from the current page.",
    "",
    `Original intent: "${intent}"`,
    `End goal: "${plan.goal}"`,
    `Current URL: ${url}`,
    "",
    `Progress: ${clickCount} click(s) recorded so far`,
    `Steps taken so far: ${JSON.stringify(stepsSoFar)}`,
    lastError ? `Last step failed: ${lastError}` : "",
    "",
    "Current page state:",
    JSON.stringify(elements, null, 2),
    "",
    "What is the single next step to take?",
    "Rules:",
    "- Emit the next action that moves toward the end goal",
    "- Never set done: true when steps taken so far is empty — record at least one action first",
    "- Set done: true only when the end goal is clearly reached on the current page",
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
  plan?: RecordingPlan,
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
    "Each demo step includes pageUrl (URL at click time) — use it with recordedMatch.hrefSuffix to choose link disambiguation.",
    ...(plan ? ["", `End goal (context): "${plan.goal}"`] : []),
    "",
    "Demo script (specific matches captured at click time — your input):",
    JSON.stringify(demoScript, null, 2),
    "",
    "Return:",
    "- script: { version: 1, steps: [...] } — generalized replay steps",
    `- description: ${MACRO_DESCRIPTION_RULE}`,
    "  Infer description from the full demo path (all steps, startUrl → endUrl) — not from intent alone.",
    "",
    "Role (critical):",
    "- One output click/fill step per demo click/fill step — same count, same order; never drop or merge steps",
    "- Navigation clicks on the path to the goal are required steps, not detours — include every demo step",
    "- Each output match must generalize the corresponding demo recordedMatch — never invent unrelated ids, tags, or text",
    "- Never retarget a demo step to a different control than recordedMatch indicates (same button/link the user clicked during recording)",
    "- Visible text with dynamic counts/badges → use textContains with static label words only, not the full string with numbers",
    "- hrefSuffix with instance-specific paths → generalize to hrefPattern or hrefContains that preserves scope — see Href rules below",
    "- When intent names a specific item (e.g. switch to main), keep a specific match — do not over-generalize",
    "",
    "Href and link disambiguation (critical — reason per step, any site):",
    "Each demo step has pageUrl + recordedMatch. Generalize each step in isolation.",
    "",
    "Segment counting (do this first for every step):",
    "- Use THIS step's pageUrl only — never startUrl, endUrl, or a prior step's page",
    "- Parse recordedMatch.hrefSuffix: if absolute URL, take pathname + search; strip hash",
    "- Count pathname segments only (split on /, ignore empty) — query string is separate",
    "- Query-only or query-heavy hrefs (?tab=followers, /user?tab=followers): pathname segment count is 1 for /user, 0 extra segments from query",
    "",
    "Decision tree:",
    "  A) Parsed href pathname equals /{segmentN} (NO query string) where segmentN is segment N of THIS step's pageUrl pathname?",
    "     → hrefFromPathSegment: N. Omit match.text and match.textContains — segment index generalizes the target.",
    "     → NOT for tab links: /user?tab=followers has a query — use B instead.",
    "  B) href has a query string (?tab=…), extra path segments, or is otherwise NOT a bare /{segment} link?",
    "     → hrefPattern (preserve query as \\\\?tab=…); add textContains only if ambiguous on that page",
    "     → Never combine hrefFromPathSegment with hrefPattern on the same step.",
    "  C) Is hrefContains alone specific enough on this page type?",
    "     → Use only when the substring cannot match unrelated nav chrome.",
    "",
    "1. Pathname segment count examples (from parsed href, not host):",
    "   - /user → ONE segment",
    "   - /org/project → TWO segments",
    "   - /user?tab=followers → ONE pathname segment; pattern query as \\\\?tab=followers",
    "   - ?tab=followers on page /user → hrefPattern \\\\?tab=followers or /[^/]+\\\\?tab=followers — NOT two pathname segments",
    "",
    "2. hrefFromPathSegment (when link equals a segment of THIS step's pageUrl pathname):",
    "   - Example (any site): pageUrl /org/project/…, href /org → hrefFromPathSegment: 0, no text field",
    "   - Example (any site): pageUrl /accounts/123/settings, href /accounts/123 → hrefFromPathSegment: 1, no text field",
    "   - Resolves from live URL at playback — do not also pin match.text to the recorded username/slug",
    "   - Do NOT use hrefPattern ^/[^/]+$ when hrefFromPathSegment applies",
    "",
    "3. hrefPattern (when href is NOT a pageUrl path segment):",
    "   - Segment count must match THIS step's parsed href pathname — never copy count from another step",
    "   - BAD: /org/project/pulls → hrefContains /pulls (matches site-wide nav)",
    "   - GOOD: /org/project/pulls → /[^/]+/[^/]+/pulls",
    "   - BAD: /user?tab=followers → /[^/]+/[^/]+\\\\?tab=followers (two segments; href has one)",
    "   - GOOD: /user?tab=followers → \\\\?tab=followers or /[^/]+\\\\?tab=followers",
    "",
    "4. Combine criteria only when needed:",
    "   - hrefFromPathSegment alone is usually enough — do not add text",
    "   - hrefPattern + textContains when multiple links share the same href shape on that page",
    "   - Query strings: preserve ?key=value as \\\\?key=value in hrefPattern (matches pathname+search at playback)",
    "",
    "5. hrefContains — only when the substring is specific enough to avoid false positives",
    "",
    "Choose the strategy that matches intent and recordedMatch — not the shortest regex.",
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
    "- hrefSuffix → hrefFromPathSegment, hrefPattern, or scoped hrefContains — see link disambiguation above",
    "- testId → testId (unchanged, only when recordedMatch had testId for that step)",
    "",
    "Forbidden:",
    "- Adding steps not present in the demo script",
    "- match fields that do not generalize from that step's recordedMatch",
    "- testId when that demo step's recordedMatch has no testId",
    "- match.text pinning a username/slug when hrefFromPathSegment or hrefPattern already generalizes",
    "- match.textContains combined with hrefFromPathSegment — hrefFromPathSegment alone must identify the link",
    "- hrefFromPathSegment combined with hrefPattern on the same step — pick one strategy",
    "- hrefFromPathSegment for hrefSuffix containing ? (tab links) — use hrefPattern \\\\?tab=… instead",
    "- hrefPattern whose pathname segment count differs from THIS step's parsed hrefSuffix pathname",
    "- Using tag when recordedMatch had no tag and text/id/href already identify the target",
    "- waitFor on a different target than the next click's match",
    "",
    "Allowed step types:",
    '- click: { type: "click", label?, match: { id?, tag?, ariaLabel?, text?, textContains?, hrefSuffix?, hrefContains?, hrefPattern?, hrefFromPathSegment?, testId? }, index?: 0 }',
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

export async function buildRecordingPlan(intent: string): Promise<RecordingPlan> {
  const prompt = buildRecordingPlanPrompt(intent);
  return generateObjectWithModels<RecordingPlan>(RecordingPlanSchema, prompt);
}

export async function getNextStep(
  intent: string,
  plan: RecordingPlan,
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
    plan,
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
  plan?: RecordingPlan,
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

  const prompt = buildCompileScriptPrompt(
    intent,
    startUrl,
    endUrl,
    demoSteps,
    plan,
  );
  const result = await generateObjectWithModels<CompiledMacroOutput>(
    CompiledMacroOutputSchema,
    prompt,
  );
  return {
    ...result,
    script: sanitizeCompiledScript(result.script),
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
    "You decide where a browser automation macro should be allowed to run.",
    "A macro runs from ONE kind of starting page — not multiple unrelated page types.",
    "",
    `User intent: "${intent}"`,
    `Recording started on: ${startUrl}`,
    `First step pageUrl: ${firstStepPageUrl}`,
    `Recording ended on: ${endUrl}`,
    `Recorded steps: ${JSON.stringify(
      steps.map((step) => ({
        type: step.type,
        pageUrl: step.pageUrl,
        selector: step.selector,
        value: step.value,
      })),
    )}`,
    "",
    "Return a JavaScript RegExp pattern (as a string) tested against the full page URL.",
    "Also return a short plain-English description for the user.",
    "",
    "Critical:",
    "- Match ONLY the page type where recording STARTED (startUrl / first step pageUrl)",
    "- endUrl is where playback navigates TO — never require endUrl before running",
    "- Pick ONE page shape — do NOT combine unrelated types (e.g. repo pages OR profile pages)",
    "- Example: started on /owner/repo → match repo pages (^…/[^/]+/[^/]+(?:/.*)?$), NOT bare profile /owner URLs",
    "- Example: started on /owner profile → match profile pages (^…/[^/]+(?:[/?#].*)?$), NOT /owner/repo URLs",
    "",
    "Rules:",
    "- Generalize slugs/ids with [^/]+ but keep the same path segment count and page role as the start URL",
    "- Keep narrow when the intent is page-specific (e.g. fill this form on this page)",
    "- Escape regex metacharacters in literal URL segments (., ?, etc.)",
    "- Prefer anchoring with ^ and $",
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
