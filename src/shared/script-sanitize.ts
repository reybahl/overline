import { normalizeElementMatch } from "@/shared/script-match";
import { isStableId } from "@/shared/stable-id";
import type { MacroStep } from "@/shared/types/macro";
import type {
  ElementMatch,
  MacroScript,
  ScriptClickStep,
  ScriptNavigateStep,
} from "@/shared/types/script";

/** Drop framework-generated ids that should not be replay targets. */
function stripUnstableId(match: ElementMatch): ElementMatch {
  if (!match.id || isStableId(match.id)) {
    return match;
  }

  const { id: _removed, ...rest } = match;
  return rest;
}

/** hrefFromPathSegment generalizes the target — exact text would contradict it. */
function stripTextWithPathSegment(match: ElementMatch): ElementMatch {
  if (match.hrefFromPathSegment === undefined) {
    return match;
  }

  const { text: _text, textContains: _textContains, ...rest } = match;
  return rest;
}

/** Tab/query hrefPattern and path-segment matching are mutually exclusive strategies. */
function stripPathSegmentWithHrefPattern(match: ElementMatch): ElementMatch {
  if (match.hrefFromPathSegment === undefined || !match.hrefPattern) {
    return match;
  }

  const { hrefFromPathSegment: _segment, ...rest } = match;
  return rest;
}

type MatchField = keyof ElementMatch;

/** Fields compile may emit when generalizing this demo capture. */
function allowedFieldsFromDemo(demo: ElementMatch): Set<MatchField> {
  const allowed = new Set<MatchField>();

  if (demo.tag) {
    allowed.add("tag");
  }
  if (demo.testId) {
    allowed.add("testId");
  }
  if (demo.ariaLabel) {
    allowed.add("ariaLabel");
  }
  if (demo.text || demo.textContains) {
    allowed.add("text");
    allowed.add("textContains");
  }
  if (demo.hrefSuffix) {
    allowed.add("hrefSuffix");
    allowed.add("hrefContains");
    allowed.add("hrefPattern");
    // Fragment hrefs (#…) are not pathname segments — hrefFromPathSegment never applies.
    if (!demo.hrefSuffix.startsWith("#")) {
      allowed.add("hrefFromPathSegment");
    }
    allowed.add("tag");
  }
  if (demo.id && isStableId(demo.id)) {
    allowed.add("id");
  }
  if (demo.pressed !== undefined) {
    allowed.add("pressed");
  }

  return allowed;
}

/** Drop compile fields that were not present on (or generalizable from) the demo step. */
function constrainMatchToDemo(
  demo: ElementMatch,
  match: ElementMatch,
): ElementMatch {
  const allowed = allowedFieldsFromDemo(demo);
  const constrained: ElementMatch = {};

  for (const key of Object.keys(match) as MatchField[]) {
    const value = match[key];
    if (allowed.has(key) && value !== undefined) {
      (constrained as Record<MatchField, ElementMatch[MatchField]>)[key] = value;
    }
  }

  return constrained;
}

function normalizeReplayMatch(demo: ElementMatch, match: ElementMatch): ElementMatch {
  let normalized = normalizeElementMatch(match);
  normalized = constrainMatchToDemo(demo, normalized);
  return stripPathSegmentWithHrefPattern(
    stripTextWithPathSegment(stripUnstableId(normalized)),
  );
}

export type DemoScriptStep = {
  type: MacroStep["type"];
  value?: string;
  pageUrl?: string;
  recordedMatch?: ElementMatch;
};

/** Demo steps with live matches — primary compile input. */
export function buildDemoScriptForCompile(
  demoSteps: MacroStep[],
): DemoScriptStep[] {
  return demoSteps
    .filter((step) => step.type === "click" || step.type === "fill")
    .map((step) => ({
      type: step.type,
      value: step.value,
      pageUrl: step.pageUrl,
      recordedMatch: step.recordedMatch,
    }));
}

/** True when a demo click was a pure anchor navigation with a replayable href. */
export function isNavigableClick(demo: DemoScriptStep): boolean {
  if (demo.type !== "click") {
    return false;
  }

  const match = demo.recordedMatch;
  if (!match?.hrefSuffix) {
    return false;
  }
  if (match.pressed !== undefined) {
    return false;
  }
  if (match.hrefSuffix.startsWith("#")) {
    return false;
  }
  if (match.tag === "button") {
    return false;
  }

  return true;
}

/** True when navigate href repeats demo pageUrl slugs as literals instead of {{segmentN}}. */
export function navigateHrefPinsDemoScope(
  script: MacroScript,
  demoSteps?: DemoScriptStep[],
): boolean {
  if (!demoSteps?.length) {
    return false;
  }

  let demoIndex = 0;

  for (const step of script.steps) {
    if (step.type !== "navigate") {
      continue;
    }

    const demo = demoSteps[demoIndex++];
    if (!demo?.pageUrl) {
      continue;
    }

    const pageSegments = new URL(demo.pageUrl).pathname.split("/").filter(Boolean);
    const hrefPath = step.href.split("?")[0]?.split("#")[0] ?? "";
    const hrefSegments = hrefPath.split("/").filter(Boolean);

    for (let i = 0; i < pageSegments.length; i += 1) {
      if (
        hrefSegments[i] === pageSegments[i] &&
        !step.href.includes(`{{segment${i}}}`)
      ) {
        return true;
      }
    }
  }

  return false;
}

function navigateToClick(
  step: ScriptNavigateStep,
  demo: DemoScriptStep,
): ScriptClickStep {
  const demoMatch = demo.recordedMatch ?? {};
  return {
    type: "click",
    label: step.label,
    match: normalizeReplayMatch(demoMatch, demoMatch),
  };
}

/**
 * Deterministic post-compile pass: ground each step's match to demo `recordedMatch`,
 * then apply structural fixes (normalize ids, strip unstable ids, sync waitFor).
 */
export function sanitizeCompiledScript(
  script: MacroScript,
  demoSteps?: DemoScriptStep[],
): MacroScript {
  const clickMatchByIndex = new Map<number, ElementMatch>();
  let demoIndex = 0;

  const steps = script.steps.map((step, index) => {
    if (step.type === "wait") {
      return step;
    }

    if (step.type === "navigate") {
      const demo = demoSteps?.[demoIndex++];
      if (!demo || !isNavigableClick(demo)) {
        if (demo?.recordedMatch) {
          const match = normalizeReplayMatch(demo.recordedMatch, demo.recordedMatch);
          clickMatchByIndex.set(index, match);
          return navigateToClick(step, demo);
        }
        return step;
      }

      return step;
    }

    if (step.type !== "click" && step.type !== "waitFor" && step.type !== "fill") {
      return step;
    }

    const demo =
      demoSteps && (step.type === "click" || step.type === "fill")
        ? demoSteps[demoIndex++]
        : undefined;

    let match = normalizeElementMatch(step.match);
    if (demo?.recordedMatch) {
      match = constrainMatchToDemo(demo.recordedMatch, match);
    }
    match = stripPathSegmentWithHrefPattern(
      stripTextWithPathSegment(stripUnstableId(match)),
    );

    if (step.type === "click") {
      clickMatchByIndex.set(index, match);
      return { ...step, match };
    }

    if (step.type === "waitFor") {
      const nextClickIndex = script.steps.findIndex(
        (entry, entryIndex) => entryIndex > index && entry.type === "click",
      );
      const nextMatch =
        nextClickIndex >= 0 ? clickMatchByIndex.get(nextClickIndex) : undefined;
      if (nextMatch) {
        match = nextMatch;
      }
    }

    return { ...step, match };
  });

  return { ...script, steps };
}
