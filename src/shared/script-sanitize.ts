import { normalizeElementMatch } from "@/shared/script-match";
import { isStableId } from "@/shared/stable-id";
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

export type DemoScriptStep = {
  type: MacroStep["type"];
  value?: string;
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
      recordedMatch: step.recordedMatch,
    }));
}

/**
 * Deterministic post-compile pass. Assumes the compile LLM output is correct;
 * only applies structural fixes (normalize ids, strip unstable ids, sync waitFor).
 */
export function sanitizeCompiledScript(script: MacroScript): MacroScript {
  const clickMatchByIndex = new Map<number, ElementMatch>();

  const steps = script.steps.map((step, index) => {
    if (step.type !== "click" && step.type !== "waitFor" && step.type !== "fill") {
      return step;
    }

    let match = stripUnstableId(normalizeElementMatch(step.match));

    if (step.type === "click") {
      clickMatchByIndex.set(index, match);
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
