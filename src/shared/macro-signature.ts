import { createLogger } from "@/shared/logger";
import {
  STANDALONE_MACRO_SIGNATURE,
  type InferredMacroSignature,
  type MacroParam,
  type MacroScriptPatchField,
} from "@/shared/types/macro-signature";
import type { Macro } from "@/shared/types/macro";
import {
  MacroScriptSchema,
  type ElementMatch,
  type MacroScript,
  type ScriptStep,
} from "@/shared/types/script";

const log = createLogger("macro-signature");

const PLACEHOLDER_RE = /\{\{([a-z][a-zA-Z0-9]*)\}\}/g;

const MATCH_KEYS = [
  "id",
  "ariaLabel",
  "text",
  "textContains",
  "hrefSuffix",
  "hrefContains",
  "hrefPattern",
] as const satisfies readonly (keyof ElementMatch)[];

const MATCH_PATCH_FIELDS = MATCH_KEYS.map(
  (key) => `match.${key}` as const,
) satisfies readonly MacroScriptPatchField[];

const ALLOWED_FIELDS: Record<ScriptStep["type"], readonly MacroScriptPatchField[]> = {
  click: MATCH_PATCH_FIELDS,
  fill: ["value", ...MATCH_PATCH_FIELDS],
  waitFor: MATCH_PATCH_FIELDS,
  wait: [],
};

function standalone(script: MacroScript) {
  return { script, signature: STANDALONE_MACRO_SIGNATURE };
}

function readField(step: ScriptStep, field: MacroScriptPatchField): string | undefined {
  if (field === "value") {
    return step.type === "fill" ? step.value : undefined;
  }
  if (step.type === "wait") {
    return undefined;
  }
  const key = field.slice("match.".length) as keyof ElementMatch;
  const value = step.match[key];
  return typeof value === "string" ? value : undefined;
}

function writeField(
  step: ScriptStep,
  field: MacroScriptPatchField,
  template: string,
): ScriptStep {
  if (field === "value") {
    if (step.type !== "fill") {
      throw new Error(`${field} only valid on fill steps`);
    }
    return { ...step, value: template };
  }
  if (step.type === "wait") {
    throw new Error(`${field} not valid on wait steps`);
  }
  const key = field.slice("match.".length) as keyof ElementMatch;
  return { ...step, match: { ...step.match, [key]: template } };
}

function paramRefsIn(value: string): Set<string> {
  const names = new Set<string>();
  for (const match of value.matchAll(PLACEHOLDER_RE)) {
    names.add(match[1]);
  }
  return names;
}

function paramRefsInScript(script: MacroScript): Set<string> {
  const names = new Set<string>();
  for (const step of script.steps) {
    const values: string[] = [];
    if (step.type === "fill") {
      values.push(step.value);
    }
    if (step.type !== "wait") {
      for (const key of MATCH_KEYS) {
        const value = step.match[key];
        if (typeof value === "string") {
          values.push(value);
        }
      }
    }
    for (const value of values) {
      for (const name of paramRefsIn(value)) {
        names.add(name);
      }
    }
  }
  return names;
}

function signatureMismatch(script: MacroScript, params: MacroParam[]): string | null {
  const declared = new Set<string>();
  for (const param of params) {
    if (declared.has(param.name)) {
      return `duplicate param: ${param.name}`;
    }
    declared.add(param.name);
  }

  const refs = paramRefsInScript(script);
  for (const name of refs) {
    if (!declared.has(name)) {
      return `undeclared param: ${name}`;
    }
  }
  for (const param of params) {
    if (!refs.has(param.name)) {
      return `unused param: ${param.name}`;
    }
  }
  return null;
}

function patchMismatch(
  script: MacroScript,
  params: MacroParam[],
  patches: InferredMacroSignature["patches"],
): string | null {
  const paramNames = new Set(params.map((param) => param.name));
  const seen = new Set<string>();

  for (const patch of patches) {
    const key = `${patch.stepIndex}:${patch.field}`;
    if (seen.has(key)) {
      return `duplicate patch: ${key}`;
    }
    seen.add(key);

    if (patch.stepIndex >= script.steps.length) {
      return `patch stepIndex out of range: ${patch.stepIndex}`;
    }

    const step = script.steps[patch.stepIndex];
    if (!ALLOWED_FIELDS[step.type].includes(patch.field)) {
      return `${patch.field} invalid on ${step.type} step`;
    }

    const templateRefs = paramRefsIn(patch.template);
    if (templateRefs.size === 0) {
      return "patch template must contain {{param}}";
    }
    for (const name of templateRefs) {
      if (!paramNames.has(name)) {
        return `undeclared param in template: ${name}`;
      }
    }
  }

  return null;
}

/** Drop demo-pinned id when another match field is templated. */
function dropPinnedId(step: ScriptStep): ScriptStep {
  if (step.type === "wait" || !step.match.id || step.match.id.includes("{{")) {
    return step;
  }
  const matchTemplated = MATCH_PATCH_FIELDS.some((field) =>
    readField(step, field)?.includes("{{"),
  );
  if (!matchTemplated) {
    return step;
  }
  const { id: _removed, ...match } = step.match;
  return { ...step, match };
}

export function macroNeedsParams(macro: Macro): boolean {
  return (macro.signature?.params.length ?? 0) > 0;
}

/** Apply LLM signature inference; fall back to standalone on any inconsistency. */
export function applyInferredMacroSignature(
  script: MacroScript,
  inferred: InferredMacroSignature,
) {
  if (inferred.standalone || inferred.params.length === 0 || inferred.patches.length === 0) {
    return standalone(script);
  }

  const patchError = patchMismatch(script, inferred.params, inferred.patches);
  if (patchError) {
    log.warn("signature patches invalid, using standalone", { error: patchError });
    return standalone(script);
  }

  let steps = [...MacroScriptSchema.parse(script).steps];
  try {
    for (const patch of inferred.patches) {
      steps[patch.stepIndex] = writeField(
        steps[patch.stepIndex],
        patch.field,
        patch.template,
      );
    }
  } catch (error) {
    log.warn("signature patch apply failed, using standalone", {
      error: error instanceof Error ? error.message : String(error),
    });
    return standalone(script);
  }

  const patchedScript: MacroScript = {
    version: 1,
    steps: steps.map(dropPinnedId),
  };
  const signature = { version: 1 as const, params: inferred.params };

  const signatureError = signatureMismatch(patchedScript, inferred.params);
  if (signatureError) {
    log.warn("signature invalid after patch, using standalone", { error: signatureError });
    return standalone(script);
  }

  return { script: patchedScript, signature };
}
