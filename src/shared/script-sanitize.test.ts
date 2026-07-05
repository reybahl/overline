import { describe, expect, test } from "bun:test";

import { sanitizeCompiledScript } from "@/shared/script-sanitize";

describe("sanitizeCompiledScript navigate", () => {
  test("passes through compile navigate href", () => {
    const script = sanitizeCompiledScript(
      {
        version: 1,
        steps: [{ type: "navigate", href: "/{{segment0}}/{{segment1}}/pulls" }],
      },
      [
        {
          type: "click",
          pageUrl: "https://example.com/acme/widget",
          recordedMatch: { tag: "a", hrefSuffix: "/acme/widget/pulls" },
        },
      ],
    );

    expect(script.steps[0]).toEqual({
      type: "navigate",
      href: "/{{segment0}}/{{segment1}}/pulls",
    });
  });

  test("downgrades navigate to click for toggle demo steps", () => {
    const script = sanitizeCompiledScript(
      {
        version: 1,
        steps: [{ type: "navigate", href: "/acme/widget/pulls" }],
      },
      [
        {
          type: "click",
          recordedMatch: {
            tag: "button",
            ariaLabel: "Not Viewed",
            pressed: false,
          },
        },
      ],
    );

    expect(script.steps[0]?.type).toBe("click");
  });
});
