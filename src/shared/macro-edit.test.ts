import { describe, expect, test } from "bun:test";

import {
  formatMacroForEdit,
  macroEditableDocumentFromMacro,
  mergeEditableDocument,
  parseMacroEditJson,
  patchMacroShortcutInText,
  addMacroParamToText,
  readShortcutFromText,
  validateMacroEdit,
} from "@/shared/macro-edit";
import type { Macro } from "@/shared/types/macro";

const MACRO_ID = "550e8400-e29b-41d4-a716-446655440000";

function baseMacro(overrides: Partial<Macro> = {}): Macro {
  return {
    id: MACRO_ID,
    name: "Open PR",
    description: "Opens a pull request",
    intent: "Open the pull request page",
    urlPattern: "^https://github\\.com/",
    steps: [
      {
        id: "660e8400-e29b-41d4-a716-446655440001",
        type: "click",
        timestamp: 1,
      },
    ],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("macroEditableDocumentFromMacro", () => {
  test("omits recording metadata and identity fields", () => {
    const document = macroEditableDocumentFromMacro(baseMacro());

    expect(document).toEqual({
      name: "Open PR",
      description: "Opens a pull request",
    });
    expect(document).not.toHaveProperty("id");
    expect(document).not.toHaveProperty("intent");
    expect(document).not.toHaveProperty("steps");
    expect(document).not.toHaveProperty("urlPattern");
    expect(document).not.toHaveProperty("createdAt");
    expect(document).not.toHaveProperty("updatedAt");
  });
});

describe("parseMacroEditJson", () => {
  test("accepts a valid edited document and preserves metadata", () => {
    const macro = baseMacro();
    const text = formatMacroForEdit({
      ...macro,
      name: "Renamed macro",
      description: "Updated description",
    });

    const result = parseMacroEditJson(text, macro);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.macro.name).toBe("Renamed macro");
    expect(result.macro.description).toBe("Updated description");
    expect(result.macro.intent).toBe(macro.intent);
    expect(result.macro.steps).toEqual(macro.steps);
    expect(result.macro.urlPattern).toBe(macro.urlPattern);
    expect(result.macro.id).toBe(MACRO_ID);
    expect(result.macro.createdAt).toBe(macro.createdAt);
    expect(result.macro.updatedAt).toBeGreaterThan(macro.updatedAt);
  });

  test("rejects invalid JSON", () => {
    const result = parseMacroEditJson("{ not json", baseMacro());
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toMatch(/json/i);
  });

  test("rejects read-only fields in the editor JSON", () => {
    const macro = baseMacro();
    const text = JSON.stringify(
      {
        ...macroEditableDocumentFromMacro(macro),
        id: "660e8400-e29b-41d4-a716-446655440001",
      },
      null,
      2,
    );

    const result = parseMacroEditJson(text, macro);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("id");
  });

  test("rejects script placeholders without params", () => {
    const macro = baseMacro({
      script: {
        version: 1,
        steps: [
          {
            type: "click",
            match: { textContains: "{{branch}}" },
          },
        ],
      },
      signature: { version: 1, params: [] },
    });

    const result = parseMacroEditJson(formatMacroForEdit(macro), macro);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("branch");
  });

  test("clears optional fields removed from the document", () => {
    const macro = baseMacro({ shortcut: "meta+k", description: "Old" });
    const text = JSON.stringify({ name: "Open PR" }, null, 2);

    const result = parseMacroEditJson(text, macro);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.macro.description).toBeUndefined();
    expect(result.macro.shortcut).toBeUndefined();
  });
});

describe("mergeEditableDocument", () => {
  test("rejects invalid run scope regex on merged macro", () => {
    const merged = mergeEditableDocument(baseMacro(), {
      name: "Open PR",
      runScope: {
        description: "Repo pages",
        pattern: "[",
      },
    });

    const result = validateMacroEdit(merged);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain("runScope.pattern");
  });
});

describe("shortcut helpers", () => {
  test("reads shortcut from JSON text", () => {
    const macro = baseMacro({ shortcut: "meta+shift+k" });
    const text = formatMacroForEdit(macro);

    expect(readShortcutFromText(text, baseMacro())).toBe("meta+shift+k");
  });

  test("patches shortcut into invalid JSON using fallback macro", () => {
    const macro = baseMacro();
    const next = patchMacroShortcutInText("{ bad", macro, "meta+k");

    expect(readShortcutFromText(next, macro)).toBe("meta+k");
    expect(next).toContain('"name": "Open PR"');
    expect(next).not.toContain("intent");
  });

  test("clears shortcut from JSON text", () => {
    const macro = baseMacro({ shortcut: "meta+k" });
    const text = formatMacroForEdit(macro);
    const next = patchMacroShortcutInText(text, macro, undefined);

    expect(readShortcutFromText(next, macro)).toBeUndefined();
  });
});

describe("addMacroParamToText", () => {
  test("appends a placeholder param to the signature", () => {
    const macro = baseMacro();
    const next = addMacroParamToText(formatMacroForEdit(macro), macro);
    const parsed = JSON.parse(next) as { signature: { params: { name: string }[] } };

    expect(parsed.signature.params).toEqual([
      { name: "newParam", label: "New parameter", type: "string" },
    ]);
  });

  test("picks a unique placeholder name", () => {
    const macro = baseMacro({
      signature: {
        version: 1,
        params: [{ name: "newParam", label: "Existing", type: "string" }],
      },
    });
    const next = addMacroParamToText(formatMacroForEdit(macro), macro);
    const parsed = JSON.parse(next) as { signature: { params: { name: string }[] } };

    expect(parsed.signature.params.map((param) => param.name)).toEqual([
      "newParam",
      "newParam2",
    ]);
  });
});
