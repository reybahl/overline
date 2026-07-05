import type { RunScope } from "@/shared/types/macro";
import type { MacroScript } from "@/shared/types/script";

export function validateRunScopePattern(pattern: string): string | null {
  try {
    RegExp(pattern);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid regex pattern";
  }
}

export function runScopeMatchesUrl(scope: RunScope, url: string): boolean {
  if (validateRunScopePattern(scope.pattern)) {
    return false;
  }

  return new RegExp(scope.pattern).test(url);
}

/**
 * True when a navigate script reads {{segmentN}} from the URL but the pattern
 * only matches the exact start depth, not sibling pages under the same prefix.
 */
export function runScopeMayBeTooNarrowForScript(
  pattern: string,
  startUrl: string,
  script: MacroScript,
): boolean {
  const usesPathSegments = script.steps.some(
    (step) => step.type === "navigate" && step.href.includes("{{segment"),
  );
  if (!usesPathSegments) {
    return false;
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return false;
  }

  if (!regex.test(startUrl)) {
    return false;
  }

  const segments = new URL(startUrl).pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  const maxSegment = Math.max(
    -1,
    ...script.steps.flatMap((step) => {
      if (step.type !== "navigate") {
        return [];
      }
      return [...step.href.matchAll(/\{\{segment(\d+)\}\}/g)].map((match) =>
        Number(match[1]),
      );
    }),
  );
  if (maxSegment < 0) {
    return false;
  }

  const prefix = `/${segments.slice(0, maxSegment + 1).join("/")}`;
  const probe = new URL(startUrl);
  probe.pathname = `${prefix}/_ol_probe_`;

  return regex.test(startUrl) && !regex.test(probe.href);
}
