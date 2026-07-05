import { describe, expect, test } from "bun:test";

import {
  generalizeNavigateHrefFromDemo,
  isPathSegmentPlaceholder,
  navigateHrefIsScopeOnly,
  resolveNavigateHref,
} from "@/shared/resolve-navigate-href";

describe("resolveNavigateHref", () => {
  test("substitutes path segments from the current page", () => {
    const href = resolveNavigateHref(
      "/{{segment0}}/{{segment1}}/pulls",
      "https://github.com/acme/widget/issues",
    );

    expect(href).toBe("https://github.com/acme/widget/pulls");
  });

  test("preserves query strings in href", () => {
    const href = resolveNavigateHref(
      "/{{segment0}}/{{segment1}}?tab=issues",
      "https://example.com/acme/widget",
    );

    expect(href).toBe("https://example.com/acme/widget?tab=issues");
  });

  test("generalizes shared path segments from demo pageUrl", () => {
    const href = generalizeNavigateHrefFromDemo(
      "https://example.com/acme/widget",
      "/acme/widget/pulls",
    );

    expect(href).toBe("/{{segment0}}/{{segment1}}/pulls");
  });
});

describe("navigateHrefIsScopeOnly", () => {
  test("true when href only uses segment placeholders", () => {
    expect(navigateHrefIsScopeOnly("/{{segment0}}/{{segment1}}/pulls")).toBe(true);
    expect(navigateHrefIsScopeOnly("/{{repoName}}/pulls")).toBe(false);
  });
});

describe("isPathSegmentPlaceholder", () => {
  test("identifies segment placeholders", () => {
    expect(isPathSegmentPlaceholder("segment0")).toBe(true);
    expect(isPathSegmentPlaceholder("prNumber")).toBe(false);
  });
});
