import { describe, expect, test } from "bun:test";

import {
  applyInferredMacroInputs,
  extractFillParamNames,
  validateMacroInputSchema,
} from "@/shared/macro-input";
import type { MacroInputSchema } from "@/shared/types/macro-input";
import type { MacroScript } from "@/shared/types/script";

const CLICK_STEP = {
  type: "click" as const,
  match: { ariaLabel: "Search" },
};

function scriptWithFill(value: string): MacroScript {
  return {
    version: 1,
    steps: [CLICK_STEP, { type: "fill", match: { ariaLabel: "Query" }, value }],
  };
}

describe("extractFillParamNames", () => {
  test("returns empty set when no placeholders", () => {
    expect(extractFillParamNames(scriptWithFill("react"))).toEqual(new Set());
  });

  test("extracts placeholder names from fill values", () => {
    expect(
      extractFillParamNames(scriptWithFill("{{searchTerm}}")),
    ).toEqual(new Set(["searchTerm"]));
  });
});

describe("validateMacroInputSchema", () => {
  test("accepts standalone schema with literal fill values", () => {
    const schema: MacroInputSchema = { version: 1, inputs: [] };
    expect(validateMacroInputSchema(scriptWithFill("react"), schema)).toBeNull();
  });

  test("accepts matching schema and placeholders", () => {
    const schema: MacroInputSchema = {
      version: 1,
      inputs: [{ name: "searchTerm", label: "Search term", type: "string" }],
    };
    expect(
      validateMacroInputSchema(scriptWithFill("{{searchTerm}}"), schema),
    ).toBeNull();
  });

  test("rejects undeclared placeholder", () => {
    const schema: MacroInputSchema = { version: 1, inputs: [] };
    expect(
      validateMacroInputSchema(scriptWithFill("{{searchTerm}}"), schema),
    ).toMatch(/undeclared/);
  });

  test("rejects unused declared input", () => {
    const schema: MacroInputSchema = {
      version: 1,
      inputs: [{ name: "searchTerm", label: "Search term", type: "string" }],
    };
    expect(validateMacroInputSchema(scriptWithFill("react"), schema)).toMatch(
      /never used/,
    );
  });

  test("rejects duplicate input names", () => {
    const schema: MacroInputSchema = {
      version: 1,
      inputs: [
        { name: "term", label: "Term A", type: "string" },
        { name: "term", label: "Term B", type: "string" },
      ],
    };
    expect(
      validateMacroInputSchema(scriptWithFill("{{term}}"), schema),
    ).toMatch(/duplicate/);
  });
});

describe("applyInferredMacroInputs", () => {
  test("standalone leaves script unchanged", () => {
    const script = scriptWithFill("react");
    const result = applyInferredMacroInputs(script, {
      standalone: true,
      inputs: [],
      fillBindings: [],
    });

    expect(result.script).toEqual(script);
    expect(result.inputSchema.inputs).toEqual([]);
  });

  test("patches fill value and returns schema", () => {
    const script = scriptWithFill("react");
    const result = applyInferredMacroInputs(script, {
      standalone: false,
      inputs: [{ name: "searchTerm", label: "Search term", type: "string" }],
      fillBindings: [{ stepIndex: 1, inputName: "searchTerm" }],
    });

    expect(result.script.steps[1]).toEqual({
      type: "fill",
      match: { ariaLabel: "Query" },
      value: "{{searchTerm}}",
    });
    expect(result.inputSchema.inputs).toHaveLength(1);
  });

  test("falls back to standalone when binding targets click step", () => {
    const script = scriptWithFill("react");
    const result = applyInferredMacroInputs(script, {
      standalone: false,
      inputs: [{ name: "searchTerm", label: "Search term", type: "string" }],
      fillBindings: [{ stepIndex: 0, inputName: "searchTerm" }],
    });

    expect(result.script).toEqual(script);
    expect(result.inputSchema.inputs).toEqual([]);
  });

  test("falls back to standalone when step index is out of range", () => {
    const script = scriptWithFill("react");
    const result = applyInferredMacroInputs(script, {
      standalone: false,
      inputs: [{ name: "searchTerm", label: "Search term", type: "string" }],
      fillBindings: [{ stepIndex: 9, inputName: "searchTerm" }],
    });

    expect(result.script).toEqual(script);
    expect(result.inputSchema.inputs).toEqual([]);
  });
});
