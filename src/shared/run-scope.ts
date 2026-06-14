import type { RunScope } from "@/shared/types/macro";

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
