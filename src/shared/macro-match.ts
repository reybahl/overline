import type { Macro } from "@/shared/types/macro";

export function deriveUrlPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function findMacroForUrl(macros: Macro[], url: string): Macro | null {
  const matches = macros.filter((macro) => {
    if (!macro.urlPattern) return false;
    return url.includes(macro.urlPattern);
  });

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0];
  }

  return matches.sort(
    (left, right) =>
      (right.urlPattern?.length ?? 0) - (left.urlPattern?.length ?? 0),
  )[0];
}
