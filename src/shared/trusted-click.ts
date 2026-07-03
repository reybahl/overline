import { clickMatchLikelyNavigates } from "@/shared/script-match";
import type { ElementMatch, ScriptClickStep, ScriptStep } from "@/shared/types/script";

/** How a click step is dispatched during playback. */
export type ClickExecutionMode = "synthetic" | "trusted";

/** Observable effect used to decide whether a synthetic click succeeded. */
export type ClickPostcondition =
  | { kind: "navigation"; urlBefore: string }
  | { kind: "nextMatch"; match: ElementMatch };

/** Explicit saved flag only — never inferred from labels or match text. */
export function clickExecutionMode(step: ScriptClickStep): ClickExecutionMode {
  return step.trustedClick === true ? "trusted" : "synthetic";
}

/**
 * CDP retry is unsafe when a second click could toggle state or trigger a
 * destructive action with no follow-up observable to validate.
 */
export function isSafeForCdpRetry(step: ScriptClickStep): boolean {
  return step.match.pressed === undefined;
}

/** In-memory learn for the rest of this run; persistence is a future hook. */
export function learnTrustedClick(step: ScriptClickStep): void {
  step.trustedClick = true;
}

/** Postconditions derived from the next script step and href navigation hints. */
export function getClickPostconditions(
  steps: ScriptStep[],
  clickIndex: number,
  urlBeforeClick: string | undefined,
): ClickPostcondition[] {
  const step = steps[clickIndex];
  if (step.type !== "click") {
    return [];
  }

  const postconditions: ClickPostcondition[] = [];

  if (urlBeforeClick && clickMatchLikelyNavigates(step.match)) {
    postconditions.push({ kind: "navigation", urlBefore: urlBeforeClick });
  }

  const next = steps[clickIndex + 1];
  if (
    next &&
    (next.type === "click" || next.type === "fill" || next.type === "waitFor")
  ) {
    postconditions.push({ kind: "nextMatch", match: next.match });
  }

  return postconditions;
}
