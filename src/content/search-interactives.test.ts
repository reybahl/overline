import { describe, expect, test } from "bun:test";

import { rankInteractives } from "@/content/search-rank";
import type { DomElement } from "@/shared/types/dom";

function element(
  partial: Partial<DomElement> & Pick<DomElement, "selector" | "ariaLabel">,
): DomElement {
  return {
    tag: "button",
    role: "button",
    controlKind: "action-button",
    text: "",
    placeholder: "",
    ...partial,
  };
}

describe("rankInteractives", () => {
  test("does not match refresh to shortcut letter r in ariaLabel", () => {
    const results = rankInteractives(
      [
        element({
          selector: "button.switch",
          controlKind: "dropdown-trigger",
          ariaLabel: "Switch repository(option shift r)",
        }),
        element({
          selector: "a.refresh",
          tag: "a",
          role: "link",
          controlKind: "link",
          text: "Refresh",
          ariaLabel: "Refresh",
        }),
      ],
      "refresh",
      { limit: 10 },
    );

    expect(results.map((el) => el.ariaLabel)).toEqual(["Refresh"]);
  });

  test("exact short token still matches", () => {
    const results = rankInteractives(
      [
        element({
          selector: "button.switch",
          ariaLabel: "Switch repository(option shift r)",
        }),
      ],
      "r",
      { limit: 10 },
    );

    expect(results).toHaveLength(1);
  });

  test("returns empty when only false-positive shortcut matches exist", () => {
    const results = rankInteractives(
      [
        element({
          selector: "button.switch",
          ariaLabel: "Switch repository(option shift r)",
        }),
      ],
      "refresh",
      { limit: 10 },
    );

    expect(results).toHaveLength(0);
  });
});
