import type { Macro } from "@/shared/types/macro";

export function deriveUrlPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function macroMatchesUrl(macro: Macro, url: string): boolean {
  if (!macro.urlPattern) {
    return false;
  }

  return url.includes(macro.urlPattern);
}

export function getMacrosForUrl(macros: Macro[], url: string): Macro[] {
  return macros.filter((macro) => macroMatchesUrl(macro, url));
}

export function findMacroForUrl(
  macros: Macro[],
  url: string,
  preferredMacroId?: string | null,
): Macro | null {
  const matches = getMacrosForUrl(macros, url);

  if (matches.length === 0) {
    return null;
  }

  if (preferredMacroId) {
    const preferred = matches.find((macro) => macro.id === preferredMacroId);
    if (preferred) {
      return preferred;
    }
  }

  return matches.sort((left, right) => {
    const patternLengthDelta =
      (right.urlPattern?.length ?? 0) - (left.urlPattern?.length ?? 0);
    if (patternLengthDelta !== 0) {
      return patternLengthDelta;
    }
    return right.createdAt - left.createdAt;
  })[0];
}
