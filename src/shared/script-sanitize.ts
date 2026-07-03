import { normalizeElementMatch } from "@/shared/script-match";
import { isStableId } from "@/shared/stable-id";
import { matchNeedsTrustedClick } from "@/shared/trusted-click";
import type { MacroStep } from "@/shared/types/macro";
import type { ElementMatch, MacroScript } from "@/shared/types/script";

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
      const trustedClick =
        demo?.recordedMatch !== undefined &&
        matchNeedsTrustedClick(demo.recordedMatch);
      return trustedClick ? { ...step, match, trustedClick: true } : { ...step, match };
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
