import { createLogger } from "@/shared/logger";
import {
  MacroScriptPatchFieldSchema,
  MacroSignatureSchema,
  STANDALONE_MACRO_SIGNATURE,
  type InferredMacroSignature,
  type MacroScriptPatchField,
  type MacroSignature,
} from "@/shared/types/macro-signature";
import type { Macro } from "@/shared/types/macro";
import {
  MacroScriptSchema,
  type MacroScript,
  type ElementMatch,
  type ScriptStep,
} from "@/shared/types/script";

const log = createLogger("macro-signature");

/** Matches {{paramName}} placeholders in templated script strings. */
export const PARAM_PLACEHOLDER_RE = /\{\{([a-z][a-zA-Z0-9]*)\}\}/g;

const MATCH_PATCH_FIELDS = [
  "match.id",
  "match.ariaLabel",
  "match.text",
  "match.textContains",
  "match.hrefSuffix",
  "match.hrefContains",
  "match.hrefPattern",
] as const satisfies readonly MacroScriptPatchField[];

type MatchPatchField = (typeof MATCH_PATCH_FIELDS)[number];

const PATCH_FIELDS_BY_STEP_TYPE: Record<ScriptStep["type"], MacroScriptPatchField[]> = {
  click: [...MATCH_PATCH_FIELDS],
  fill: ["value", ...MATCH_PATCH_FIELDS],
  waitFor: [...MATCH_PATCH_FIELDS],
  wait: [],
};

function matchFieldKey(field: MatchPatchField): keyof ElementMatch {
  return field.slice("match.".length) as keyof ElementMatch;
}

export function macroNeedsParams(macro: Macro): boolean {
  return (macro.signature?.params.length ?? 0) > 0;
}

function extractParamNamesFromString(value: string): Set<string> {
  const names = new Set<string>();
  for (const match of value.matchAll(PARAM_PLACEHOLDER_RE)) {
    names.add(match[1]);
  }
  return names;
}

function templatedStringsForStep(step: ScriptStep): string[] {
  switch (step.type) {
    case "click":
    case "waitFor":
      return MATCH_PATCH_FIELDS.map((field) => readScriptField(step, field)).filter(
        (value): value is string => value !== undefined,
      );
    case "fill":
      return [
        step.value,
        ...MATCH_PATCH_FIELDS.map((field) => readScriptField(step, field)).filter(
          (value): value is string => value !== undefined,
        ),
      ];
    case "wait":
      return [];
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

export function extractScriptParamNames(script: { steps: ScriptStep[] }): Set<string> {
  const names = new Set<string>();

  for (const step of script.steps) {
    for (const value of templatedStringsForStep(step)) {
      for (const name of extractParamNamesFromString(value)) {
        names.add(name);
      }
    }
  }

  return names;
}

export function readScriptField(
  step: ScriptStep,
  field: MacroScriptPatchField,
): string | undefined {
  if (field === "value") {
    return step.type === "fill" ? step.value : undefined;
  }

  if (step.type === "wait") {
    return undefined;
  }

  const matchKey = matchFieldKey(field as MatchPatchField);
  const value = step.match[matchKey];
  return typeof value === "string" ? value : undefined;
}

export function writeScriptField(
  step: ScriptStep,
  field: MacroScriptPatchField,
  template: string,
): ScriptStep {
  if (field === "value") {
    if (step.type !== "fill") {
      throw new Error(`field ${field} is only valid on fill steps`);
    }
    return { ...step, value: template };
  }

  if (step.type === "wait") {
    throw new Error(`field ${field} is not valid on wait steps`);
  }

  const matchKey = matchFieldKey(field as MatchPatchField);
  return {
    ...step,
    match: {
      ...step.match,
      [matchKey]: template,
    },
  };
}

function fieldAllowedOnStep(step: ScriptStep, field: MacroScriptPatchField): boolean {
  return PATCH_FIELDS_BY_STEP_TYPE[step.type].includes(field);
}

/** Returns an error message when invalid, otherwise null. */
export function validateMacroSignature(
  script: MacroScript,
  signature: MacroSignature,
): string | null {
  const parsedSignature = MacroSignatureSchema.safeParse(signature);
  if (!parsedSignature.success) {
    return parsedSignature.error.message;
  }

  const parsed = parsedSignature.data;
  const declared = new Set<string>();

  for (const param of parsed.params) {
    if (declared.has(param.name)) {
      return `duplicate param name: ${param.name}`;
    }
    declared.add(param.name);
  }

  const referenced = extractScriptParamNames(script);

  for (const name of referenced) {
    if (!declared.has(name)) {
      return `script references undeclared param: ${name}`;
    }
  }

  for (const param of parsed.params) {
    if (!referenced.has(param.name)) {
      return `declared param never used in script: ${param.name}`;
    }
  }

  if (parsed.params.length === 0 && referenced.size > 0) {
    return "script has placeholders but signature is empty";
  }

  if (parsed.params.length > 0 && referenced.size === 0) {
    return "signature declares params but script has no placeholders";
  }

  return null;
}

function extractParamNamesFromTemplate(template: string): Set<string> {
  return extractParamNamesFromString(template);
}

function validatePatches(
  script: MacroScript,
  inferred: Extract<InferredMacroSignature, { standalone: false }>,
): string | null {
  const paramNames = new Set(inferred.params.map((param) => param.name));
  const patchedFields = new Set<string>();

  for (const patch of inferred.patches) {
    const patchKey = `${patch.stepIndex}:${patch.field}`;
    if (patchedFields.has(patchKey)) {
      return `duplicate patch for step ${patch.stepIndex} field ${patch.field}`;
    }
    patchedFields.add(patchKey);

    if (!MacroScriptPatchFieldSchema.safeParse(patch.field).success) {
      return `invalid patch field: ${patch.field}`;
    }

    if (patch.stepIndex >= script.steps.length) {
      return `patch stepIndex out of range: ${patch.stepIndex}`;
    }

    const step = script.steps[patch.stepIndex];
    if (!fieldAllowedOnStep(step, patch.field)) {
      return `patch field ${patch.field} is not valid on ${step.type} step at index ${patch.stepIndex}`;
    }

    const templateParams = extractParamNamesFromTemplate(patch.template);
    if (templateParams.size === 0) {
      return `patch template must contain at least one {{param}} placeholder`;
    }

    for (const name of templateParams) {
      if (!paramNames.has(name)) {
        return `patch template references undeclared param: ${name}`;
      }
    }
  }

  return null;
}

export type AppliedMacroSignature = {
  script: MacroScript;
  signature: MacroSignature;
};

function standaloneResult(script: MacroScript): AppliedMacroSignature {
  return {
    script,
    signature: STANDALONE_MACRO_SIGNATURE,
  };
}

/**
 * Apply LLM signature inference to a compiled script. On any inconsistency, fall back
 * to standalone (original script, empty params).
 */
export function applyInferredMacroSignature(
  script: MacroScript,
  inferred: InferredMacroSignature,
): AppliedMacroSignature {
  if (inferred.standalone) {
    return standaloneResult(script);
  }

  const patchError = validatePatches(script, inferred);
  if (patchError) {
    log.warn("signature patches invalid, using standalone", { error: patchError });
    return standaloneResult(script);
  }

  const patched = MacroScriptSchema.parse(script);
  const steps = [...patched.steps];

  for (const patch of inferred.patches) {
    const step = steps[patch.stepIndex];
    try {
      steps[patch.stepIndex] = writeScriptField(step, patch.field, patch.template);
    } catch (error) {
      log.warn("signature patch apply failed, using standalone", {
        error: error instanceof Error ? error.message : String(error),
        stepIndex: patch.stepIndex,
        field: patch.field,
      });
      return standaloneResult(script);
    }
  }

  const patchedScript = {
    ...patched,
    steps: sanitizeParameterizedSteps(steps),
  };
  const signature: MacroSignature = {
    version: 1,
    params: inferred.params,
  };

  const signatureError = validateMacroSignature(patchedScript, signature);
  if (signatureError) {
    log.warn("signature invalid after patch, using standalone", {
      error: signatureError,
    });
    return standaloneResult(script);
  }

  return { script: patchedScript, signature };
}

/** Drop demo-pinned ids when another match field carries {{param}} — e.g. issue_1980_link + /pull/{{prNumber}}. */
function stripPinnedIdsWhenMatchTemplated(step: ScriptStep): ScriptStep {
  if (step.type === "wait") {
    return step;
  }

  const matchUsesTemplate = MATCH_PATCH_FIELDS.some((field) => {
    const value = readScriptField(step, field);
    return value?.includes("{{") ?? false;
  });

  if (!matchUsesTemplate || !step.match.id || step.match.id.includes("{{")) {
    return step;
  }

  const { id: _removed, ...match } = step.match;
  return { ...step, match };
}

function sanitizeParameterizedSteps(steps: ScriptStep[]): ScriptStep[] {
  return steps.map(stripPinnedIdsWhenMatchTemplated);
}
