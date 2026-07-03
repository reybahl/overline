import type { Macro } from "@/shared/types/macro";
import { runScopeMatchesUrl } from "@/shared/run-scope";

export function deriveUrlPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function macroMatchesUrl(macro: Macro, url: string): boolean {
  if (macro.runScope) {
    return runScopeMatchesUrl(macro.runScope, url);
  }

  if (!macro.urlPattern) {
    return false;
  }

  return url.includes(macro.urlPattern);
}

export function getMacrosForUrl(macros: Macro[], url: string): Macro[] {
  return macros.filter((macro) => macroMatchesUrl(macro, url));
}
