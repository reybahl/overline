const SEGMENT_PLACEHOLDER_RE = /\{\{segment(\d+)\}\}/g;

/** True for {{segment0}}-style placeholders — resolved at playback, not macro params. */
export function isPathSegmentPlaceholder(name: string): boolean {
  return /^segment\d+$/.test(name);
}

function splitPathnameAndSearch(path: string): { pathname: string; search: string } {
  const queryIndex = path.indexOf("?");
  if (queryIndex < 0) {
    return { pathname: path, search: "" };
  }
  return {
    pathname: path.slice(0, queryIndex),
    search: path.slice(queryIndex),
  };
}

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/**
 * Build navigate href from demo pageUrl + link hrefSuffix.
 * Segments shared with pageUrl become {{segmentN}}; static path tail stays literal.
 */
export function generalizeNavigateHrefFromDemo(
  pageUrl: string,
  hrefSuffix: string,
): string {
  const pageSegments = pathSegments(new URL(pageUrl).pathname);
  const normalizedSuffix = hrefSuffix.startsWith("/") ? hrefSuffix : `/${hrefSuffix}`;
  const { pathname, search } = splitPathnameAndSearch(normalizedSuffix);
  const targetSegments = pathSegments(pathname);

  const generalized = targetSegments.map((segment, index) => {
    if (pageSegments[index] === segment) {
      return `{{segment${index}}}`;
    }
    return segment;
  });

  return `/${generalized.join("/")}${search}`;
}

/** True when every {{…}} in href is a {{segmentN}} placeholder. */
export function navigateHrefIsScopeOnly(href: string): boolean {
  const placeholders = [...href.matchAll(/\{\{([a-z][a-zA-Z0-9]*)\}\}/g)];
  return placeholders.length > 0 && placeholders.every((match) => isPathSegmentPlaceholder(match[1]));
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
