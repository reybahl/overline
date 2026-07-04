import { describe, expect, test } from "bun:test";

import {
  applyInferredMacroSignature,
  extractScriptParamNames,
  readScriptField,
  validateMacroSignature,
  writeScriptField,
} from "@/shared/macro-signature";
import type { MacroSignature } from "@/shared/types/macro-signature";
import type { MacroScript, ScriptStep } from "@/shared/types/script";

const CLICK_STEP: ScriptStep = {
  type: "click",
  match: { id: "issue_1980_link", hrefContains: "/pull/1980" },
};

function scriptWithSteps(steps: ScriptStep[]): MacroScript {
  return { version: 1, steps };
}

describe("readScriptField / writeScriptField", () => {
  test("reads and writes click match fields", () => {
    expect(readScriptField(CLICK_STEP, "match.id")).toBe("issue_1980_link");
    const patched = writeScriptField(
      CLICK_STEP,
      "match.hrefContains",
      "/pull/{{prNumber}}",
    );
    expect(readScriptField(patched, "match.hrefContains")).toBe("/pull/{{prNumber}}");
  });

  test("reads and writes fill value", () => {
    const fill: ScriptStep = {
      type: "fill",
      match: { ariaLabel: "Search" },
      value: "react",
    };
    const patched = writeScriptField(fill, "value", "{{searchTerm}}");
    expect(readScriptField(patched, "value")).toBe("{{searchTerm}}");
  });
});

describe("extractScriptParamNames", () => {
  test("returns empty set when no placeholders", () => {
    expect(extractScriptParamNames(scriptWithSteps([CLICK_STEP]))).toEqual(new Set());
  });

  test("extracts placeholders from click matches and fill values", () => {
    const script = scriptWithSteps([
      {
        type: "click",
        match: { hrefContains: "/pull/{{prNumber}}" },
      },
      {
        type: "fill",
        match: { ariaLabel: "Search" },
        value: "{{searchTerm}}",
      },
    ]);

    expect(extractScriptParamNames(script)).toEqual(
      new Set(["prNumber", "searchTerm"]),
    );
  });
});

describe("validateMacroSignature", () => {
  test("accepts standalone signature with literal script", () => {
    const signature: MacroSignature = { version: 1, params: [] };
    expect(validateMacroSignature(scriptWithSteps([CLICK_STEP]), signature)).toBeNull();
  });

  test("accepts matching signature and placeholders", () => {
    const signature: MacroSignature = {
      version: 1,
      params: [{ name: "prNumber", label: "PR number", type: "number" }],
    };
    const script = scriptWithSteps([
      { type: "click", match: { hrefContains: "/pull/{{prNumber}}" } },
    ]);
    expect(validateMacroSignature(script, signature)).toBeNull();
  });

  test("rejects undeclared placeholder", () => {
    const signature: MacroSignature = { version: 1, params: [] };
    const script = scriptWithSteps([
      { type: "click", match: { hrefContains: "/pull/{{prNumber}}" } },
    ]);
    expect(validateMacroSignature(script, signature)).toMatch(/undeclared/);
  });
});

describe("applyInferredMacroSignature", () => {
  test("standalone leaves script unchanged", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: true,
      params: [],
      patches: [],
    });

    expect(result.script).toEqual(script);
    expect(result.signature.params).toEqual([]);
  });

  test("patches click match for PR number", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "prNumber", label: "PR number", type: "number" }],
      patches: [
        {
          stepIndex: 0,
          field: "match.hrefContains",
          template: "/pull/{{prNumber}}",
        },
      ],
    });

    expect(result.script.steps[0]).toEqual({
      type: "click",
      match: {
        hrefContains: "/pull/{{prNumber}}",
      },
    });
    expect(result.signature.params).toHaveLength(1);
  });

  test("patches fill value", () => {
    const script = scriptWithSteps([
      {
        type: "fill",
        match: { ariaLabel: "Search" },
        value: "react",
      },
    ]);

    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "searchTerm", label: "Search term", type: "string" }],
      patches: [{ stepIndex: 0, field: "value", template: "{{searchTerm}}" }],
    });

    expect(readScriptField(result.script.steps[0], "value")).toBe("{{searchTerm}}");
  });

  test("falls back to standalone when patch targets invalid field", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "prNumber", label: "PR number", type: "number" }],
      patches: [{ stepIndex: 0, field: "value", template: "{{prNumber}}" }],
    });

    expect(result.script).toEqual(script);
    expect(result.signature.params).toEqual([]);
  });

  test("falls back when patch template omits placeholders", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "prNumber", label: "PR number", type: "number" }],
      patches: [
        { stepIndex: 0, field: "match.hrefContains", template: "/pull/1980" },
      ],
    });

    expect(result.script).toEqual(script);
    expect(result.signature.params).toEqual([]);
  });

  test("applies LLM-style dual patches for PR click", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "prNumber", label: "PR Number", type: "number" }],
      patches: [
        { stepIndex: 0, field: "match.id", template: "issue_{{prNumber}}_link" },
        { stepIndex: 0, field: "match.hrefContains", template: "/pull/{{prNumber}}" },
      ],
    });

    expect(result.signature.params).toHaveLength(1);
    expect(readScriptField(result.script.steps[0], "match.id")).toBe(
      "issue_{{prNumber}}_link",
    );
    expect(readScriptField(result.script.steps[0], "match.hrefContains")).toBe(
      "/pull/{{prNumber}}",
    );
  });
});
