import { describe, expect, test } from "bun:test";

import { migrateMacroRaw } from "@/shared/macro-migrate";

describe("migrateMacroRaw", () => {
  test("keeps navigate script steps", () => {
    const { macro, changed } = migrateMacroRaw({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Open Pull Requests Tab",
      intent: "go to pull requests",
      script: {
        version: 1,
        steps: [{ type: "navigate", href: "/{{segment0}}/{{segment1}}/pulls" }],
      },
      steps: [],
      createdAt: 0,
      updatedAt: 0,
    });

    expect(changed).toBe(false);
    expect(macro?.script?.steps[0]).toEqual({
      type: "navigate",
      href: "/{{segment0}}/{{segment1}}/pulls",
    });
  });
});
