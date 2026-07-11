import { describe, expect, test } from "bun:test";

import {
  isNavigableClick,
  navigateHrefPinsDemoScope,
  sanitizeCompiledScript,
} from "@/shared/script-sanitize";

describe("navigateHrefPinsDemoScope", () => {
  test("detects literal demo slugs in navigate href", () => {
    expect(
      navigateHrefPinsDemoScope(
        {
          version: 1,
          steps: [{ type: "navigate", href: "/acme/widget/pulls" }],
        },
        [
          {
            type: "click",
            pageUrl: "https://example.com/acme/widget",
            recordedMatch: { hrefSuffix: "/acme/widget/pulls" },
          },
        ],
      ),
    ).toBe(true);
  });

  test("accepts generalized segment placeholders", () => {
    expect(
      navigateHrefPinsDemoScope(
        {
          version: 1,
          steps: [{ type: "navigate", href: "/{{segment0}}/{{segment1}}/pulls" }],
        },
        [
          {
            type: "click",
            pageUrl: "https://example.com/acme/widget",
            recordedMatch: { hrefSuffix: "/acme/widget/pulls" },
          },
        ],
      ),
    ).toBe(false);
  });
});

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

  test("downgrades navigate to click for same-page reload links", () => {
    const script = sanitizeCompiledScript(
      {
        version: 1,
        steps: [
          {
            type: "navigate",
            href: "/{{segment0}}/{{segment1}}/pull/{{segment3}}/changes",
          },
        ],
      },
      [
        {
          type: "click",
          pageUrl: "https://github.com/acme/widget/pull/6/changes",
          recordedMatch: {
            tag: "a",
            ariaLabel: "Refresh",
            text: "Refresh",
            hrefSuffix: "/acme/widget/pull/6/changes",
          },
        },
      ],
    );

    expect(script.steps[0]).toEqual({
      type: "click",
      match: {
        tag: "a",
        ariaLabel: "Refresh",
        text: "Refresh",
      },
    });
  });
});

describe("sanitizeCompiledScript click matches", () => {
  test("strips unresolved {{segmentN}} from click hrefSuffix", () => {
    const script = sanitizeCompiledScript(
      {
        version: 1,
        steps: [
          {
            type: "click",
            match: {
              tag: "a",
              ariaLabel: "Refresh",
              text: "Refresh",
              hrefSuffix:
                "/{{segment0}}/{{segment1}}/{{segment2}}/{{segment3}}/{{segment4}}",
            },
          },
        ],
      },
      [
        {
          type: "click",
          pageUrl: "https://github.com/acme/widget/pull/6/changes",
          recordedMatch: {
            tag: "a",
            ariaLabel: "Refresh",
            text: "Refresh",
            hrefSuffix: "/acme/widget/pull/6/changes",
          },
        },
      ],
    );

    expect(script.steps[0]).toEqual({
      type: "click",
      match: {
        tag: "a",
        ariaLabel: "Refresh",
        text: "Refresh",
      },
    });
  });

  test("strips same-page href fields even when literal", () => {
    const script = sanitizeCompiledScript(
      {
        version: 1,
        steps: [
          {
            type: "click",
            match: {
              tag: "a",
              ariaLabel: "Refresh",
              text: "Refresh",
              hrefSuffix: "/acme/widget/pull/6/changes",
            },
          },
        ],
      },
      [
        {
          type: "click",
          pageUrl: "https://github.com/acme/widget/pull/6/changes",
          recordedMatch: {
            tag: "a",
            ariaLabel: "Refresh",
            text: "Refresh",
            hrefSuffix: "/acme/widget/pull/6/changes",
          },
        },
      ],
    );

    expect(script.steps[0]).toEqual({
      type: "click",
      match: {
        tag: "a",
        ariaLabel: "Refresh",
        text: "Refresh",
      },
    });
  });
});

describe("isNavigableClick", () => {
  test("rejects same-page reload hrefs", () => {
    expect(
      isNavigableClick({
        type: "click",
        pageUrl: "https://github.com/acme/widget/pull/6/changes",
        recordedMatch: {
          tag: "a",
          hrefSuffix: "/acme/widget/pull/6/changes",
        },
      }),
    ).toBe(false);
  });

  test("keeps real navigation hops", () => {
    expect(
      isNavigableClick({
        type: "click",
        pageUrl: "https://github.com/acme/widget",
        recordedMatch: {
          tag: "a",
          hrefSuffix: "/acme/widget/pulls",
        },
      }),
    ).toBe(true);
  });
});
