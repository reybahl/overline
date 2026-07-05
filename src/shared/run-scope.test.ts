import { describe, expect, test } from "bun:test";

import { runScopeMayBeTooNarrowForScript } from "@/shared/run-scope";

describe("runScopeMayBeTooNarrowForScript", () => {
  const navigateScript = {
    version: 1 as const,
    steps: [{ type: "navigate" as const, href: "/{{segment0}}/{{segment1}}/pulls" }],
  };

  test("detects exact-depth pattern for segment navigate script", () => {
    expect(
      runScopeMayBeTooNarrowForScript(
        "^https://example\\.com/[^/]+/[^/]+/?$",
        "https://example.com/acme/widget",
        navigateScript,
      ),
    ).toBe(true);
  });

  test("accepts prefix pattern with subpaths", () => {
    expect(
      runScopeMayBeTooNarrowForScript(
        "^https://example\\.com/[^/]+/[^/]+(?:/.*)?$",
        "https://example.com/acme/widget",
        navigateScript,
      ),
    ).toBe(false);
  });

  test("ignores click-only scripts", () => {
    expect(
      runScopeMayBeTooNarrowForScript(
        "^https://example\\.com/[^/]+/[^/]+/?$",
        "https://example.com/acme/widget",
        {
          version: 1,
          steps: [{ type: "click", match: { text: "Copy" } }],
        },
      ),
    ).toBe(false);
  });
});
