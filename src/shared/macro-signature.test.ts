import { describe, expect, test } from "bun:test";

import {
  applyInferredMacroSignature,
  instantiateMacroScript,
  macroNeedsParams,
  resolveMacroParams,
  validateMacroParamValues,
} from "@/shared/macro-signature";
import type { MacroScript, ScriptStep } from "@/shared/types/script";

const CLICK_STEP: ScriptStep = {
  type: "click",
  match: { id: "issue_1980_link", hrefContains: "/pull/1980" },
};

function scriptWithSteps(steps: ScriptStep[]): MacroScript {
  return { version: 1, steps };
}

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

  test("patches click match href", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "prNumber", label: "PR number", type: "number" }],
      patches: [
        { stepIndex: 0, field: "match.hrefContains", template: "/pull/{{prNumber}}" },
      ],
    });

    expect(result.script.steps[0]).toEqual({
      type: "click",
      match: { hrefContains: "/pull/{{prNumber}}" },
    });
    expect(result.signature.params).toHaveLength(1);
  });

  test("patches fill value", () => {
    const script = scriptWithSteps([
      { type: "fill", match: { ariaLabel: "Search" }, value: "react" },
    ]);

    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "searchTerm", label: "Search term", type: "string" }],
      patches: [{ stepIndex: 0, field: "value", template: "{{searchTerm}}" }],
    });

    expect(result.script.steps[0]).toMatchObject({ value: "{{searchTerm}}" });
  });

  test("falls back when patch targets invalid field", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "prNumber", label: "PR number", type: "number" }],
      patches: [{ stepIndex: 0, field: "value", template: "{{prNumber}}" }],
    });

    expect(result.script).toEqual(script);
    expect(result.signature.params).toEqual([]);
  });

  test("falls back when template has no placeholder", () => {
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

  test("applies dual patches on id and href", () => {
    const script = scriptWithSteps([CLICK_STEP]);
    const result = applyInferredMacroSignature(script, {
      standalone: false,
      params: [{ name: "prNumber", label: "PR Number", type: "number" }],
      patches: [
        { stepIndex: 0, field: "match.id", template: "issue_{{prNumber}}_link" },
        { stepIndex: 0, field: "match.hrefContains", template: "/pull/{{prNumber}}" },
      ],
    });

    expect(result.script.steps[0]).toEqual({
      type: "click",
      match: {
        id: "issue_{{prNumber}}_link",
        hrefContains: "/pull/{{prNumber}}",
      },
    });
  });
});

describe("instantiateMacroScript", () => {
  test("substitutes placeholders in click match fields", () => {
    const script = scriptWithSteps([
      {
        type: "click",
        match: {
          id: "issue_{{prNumber}}_link",
          hrefContains: "/pull/{{prNumber}}",
        },
      },
    ]);

    const result = instantiateMacroScript(script, { prNumber: "42" });

    expect(result.steps[0]).toEqual({
      type: "click",
      match: { id: "issue_42_link", hrefContains: "/pull/42" },
    });
  });

  test("substitutes fill value", () => {
    const script = scriptWithSteps([
      { type: "fill", match: { ariaLabel: "Search" }, value: "{{searchTerm}}" },
    ]);

    const result = instantiateMacroScript(script, { searchTerm: "react" });

    expect(result.steps[0]).toMatchObject({ value: "react" });
  });
});

describe("resolveMacroParams", () => {
  test("uses signature metadata when present", () => {
    const macro = {
      signature: {
        version: 1 as const,
        params: [{ name: "branch", label: "Branch name", type: "string" as const }],
      },
      script: scriptWithSteps([
        {
          type: "click",
          match: { ariaLabel: "{{branch}}", text: "{{branch}}" },
        },
      ]),
    };

    expect(resolveMacroParams(macro as never)).toEqual([
      { name: "branch", label: "Branch name", type: "string" },
    ]);
  });

  test("derives params from script placeholders when signature is missing", () => {
    const macro = {
      script: scriptWithSteps([
        {
          type: "click",
          match: { ariaLabel: "{{branch}}", text: "{{branch}}" },
        },
      ]),
    };

    expect(resolveMacroParams(macro as never)).toEqual([
      { name: "branch", label: "Branch", type: "string" },
    ]);
    expect(macroNeedsParams(macro as never)).toBe(true);
  });
});

describe("validateMacroParamValues", () => {
  const params = [
    { name: "prNumber", label: "PR number", type: "number" as const },
    { name: "searchTerm", label: "Search term", type: "string" as const },
  ];

  test("rejects empty values", () => {
    expect(validateMacroParamValues(params, { prNumber: "1", searchTerm: "" })).toBe(
      "Search term is required.",
    );
  });

  test("rejects non-numeric number params", () => {
    expect(validateMacroParamValues(params, { prNumber: "abc", searchTerm: "x" })).toBe(
      "PR number must be a number.",
    );
  });

  test("accepts valid values", () => {
    expect(
      validateMacroParamValues(params, { prNumber: "42", searchTerm: "react" }),
    ).toBeNull();
  });
});
