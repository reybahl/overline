import type { ElementMatch } from "@/shared/types/script";

export function normalizeElementId(id: string): string {
  return id.startsWith("#") ? id.slice(1) : id;
}

export function normalizeElementMatch(match: ElementMatch): ElementMatch {
  if (!match.id) {
    return match;
  }

  const id = normalizeElementId(match.id);
  return id === match.id ? match : { ...match, id };
}

export function elementMatchesEqual(a: ElementMatch, b: ElementMatch): boolean {
  return (
    JSON.stringify(normalizeElementMatch(a)) ===
    JSON.stringify(normalizeElementMatch(b))
  );
}

/** True when a click match targets a link href — likely a full navigation, not in-page UI. */
export function clickMatchLikelyNavigates(match: ElementMatch): boolean {
  return (
    match.hrefFromPathSegment !== undefined ||
    Boolean(match.hrefPattern) ||
    Boolean(match.hrefContains) ||
    Boolean(match.hrefSuffix)
  );
}
