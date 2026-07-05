const SEGMENT_PLACEHOLDER_RE = /\{\{segment(\d+)\}\}/g;

/** True for {{segment0}}-style placeholders — resolved at playback, not macro params. */
export function isPathSegmentPlaceholder(name: string): boolean {
  return /^segment\d+$/.test(name);
}

/** Resolve pathname+search template against a page URL (or current location in content). */
export function resolveNavigateHref(href: string, pageUrl: string): string {
  const page = new URL(pageUrl);
  const segments = page.pathname.split("/").filter(Boolean);
  const withSegments = href.replace(SEGMENT_PLACEHOLDER_RE, (_match, index: string) => {
    return segments[Number(index)] ?? "";
  });
  return new URL(withSegments, page.origin).href;
}
