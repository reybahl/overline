import type { ElementMatch } from "@/shared/types/script";

const TRUSTED_CLICK_LABEL = /\bcopy\b/i;

function labelNeedsTrustedClick(label: string): boolean {
  return TRUSTED_CLICK_LABEL.test(label);
}

/** Whether a match targets controls that need CDP trusted input (e.g. clipboard copy). */
export function matchNeedsTrustedClick(match: ElementMatch): boolean {
  const labels = [match.ariaLabel, match.text, match.textContains].filter(
    (value): value is string => Boolean(value),
  );

  return labels.some(labelNeedsTrustedClick);
}

/** Playback gate: sanitize sets this at compile time; legacy scripts infer from match. */
export function stepNeedsTrustedClick(step: {
  trustedClick?: boolean;
  match: ElementMatch;
}): boolean {
  if (step.trustedClick !== undefined) {
    return step.trustedClick;
  }
  return matchNeedsTrustedClick(step.match);
}
