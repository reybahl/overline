import { createLogger } from "@/shared/logger";
import { isPathSegmentPlaceholder } from "@/shared/resolve-navigate-href";
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
  navigate: ["href"],
};

function standalone(script: MacroScript) {
  return { script, signature: STANDALONE_MACRO_SIGNATURE };
}

function readField(step: ScriptStep, field: MacroScriptPatchField): string | undefined {
  if (field === "value") {
    return step.type === "fill" ? step.value : undefined;
  }
  if (field === "href") {
    return step.type === "navigate" ? step.href : undefined;
  }
  if (step.type === "wait" || step.type === "navigate") {
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
  if (field === "href") {
    if (step.type !== "navigate") {
      throw new Error(`${field} only valid on navigate steps`);
    }
    return { ...step, href: template };
  }
  if (step.type === "wait" || step.type === "navigate") {
    throw new Error(`${field} not valid on ${step.type} steps`);
  }
  const key = field.slice("match.".length) as keyof ElementMatch;
  return { ...step, match: { ...step.match, [key]: template } };
}

function paramRefsIn(value: string): Set<string> {
  const names = new Set<string>();
  for (const match of value.matchAll(PLACEHOLDER_RE)) {
    const name = match[1];
    if (!isPathSegmentPlaceholder(name)) {
      names.add(name);
    }
  }
  return names;
}

/** Placeholder names referenced in a compiled script. */
export function getParamRefsInScript(script: MacroScript): Set<string> {
  const names = new Set<string>();
  for (const step of script.steps) {
    const values: string[] = [];
    if (step.type === "fill") {
      values.push(step.value);
    }
    if (step.type === "navigate") {
      values.push(step.href);
    }
    if (step.type === "click" || step.type === "waitFor") {
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

/** Returns an error when the script references an undefined param. */
export function validateMacroScriptSignature(
  script: MacroScript,
  params: MacroParam[],
): string | null {
  const declared = new Set<string>();
  for (const param of params) {
    if (declared.has(param.name)) {
      return `Duplicate param name "${param.name}".`;
    }
    declared.add(param.name);
  }

  for (const name of getParamRefsInScript(script)) {
    if (!declared.has(name)) {
      return `Script uses {{${name}}} but no param "${name}" is defined. Add it in Params first.`;
    }
  }
  return null;
}

function stripOrphanSignature(macro: Macro): Macro {
  if (!macro.script && (macro.signature?.params.length ?? 0) > 0) {
    return { ...macro, signature: STANDALONE_MACRO_SIGNATURE };
  }

  return macro;
}

/** Validate script/signature sync before persisting a user-edited macro. */
export function validateMacroForSave(macro: Macro): Macro {
  const stripped = stripOrphanSignature(macro);
  if (!stripped.script) {
    return stripped;
  }

  const refs = getParamRefsInScript(stripped.script);
  if (refs.size === 0) {
    return stripped;
  }

  const error = validateMacroScriptSignature(
    stripped.script,
    stripped.signature?.params ?? [],
  );
  if (error) {
    throw new Error(error);
  }

  return stripped;
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
  if (step.type !== "click" || !step.match.id || step.match.id.includes("{{")) {
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

/** Best-effort repair when script placeholders and signature metadata diverge. */
export function repairMacroSignature(macro: Macro): Macro {
  const stripped = stripOrphanSignature(macro);
  if (!stripped.script) {
    return stripped;
  }

  const refs = getParamRefsInScript(stripped.script);
  const params = stripped.signature?.params ?? [];

  if (refs.size === 0) {
    return stripped;
  }

  if (params.length > 0 && !validateMacroScriptSignature(stripped.script, params)) {
    return stripped;
  }

  const existingByName = new Map(params.map((param) => [param.name, param]));
  const repairedParams = [...refs].map(
    (name) =>
      existingByName.get(name) ?? {
        name,
        label: humanizeParamName(name),
        type: "string" as const,
      },
  );
  log.warn("macro signature repaired from script placeholders", { macroId: macro.id });
  return { ...stripped, signature: { version: 1, params: repairedParams } };
}

function humanizeParamName(name: string): string {
  const spaced = name.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function macroNeedsParams(macro: Macro): boolean {
  return (macro.signature?.params.length ?? 0) > 0;
}

export type MacroParamValues = Record<string, string>;

function substituteParamsInString(value: string, params: MacroParamValues): string {
  return value.replace(PLACEHOLDER_RE, (placeholder, name: string) => {
    if (isPathSegmentPlaceholder(name)) {
      return placeholder;
    }
    const replacement = params[name];
    if (replacement === undefined) {
      throw new Error(`Missing value for param "${name}".`);
    }
    return replacement;
  });
}

function instantiateStep(step: ScriptStep, params: MacroParamValues): ScriptStep {
  if (step.type === "wait") {
    return step;
  }

  if (step.type === "navigate") {
    return {
      ...step,
      href: substituteParamsInString(step.href, params),
    };
  }

  if (step.type === "fill") {
    const match = Object.fromEntries(
      Object.entries(step.match).map(([key, value]) => [
        key,
        typeof value === "string" ? substituteParamsInString(value, params) : value,
      ]),
    ) as ElementMatch;
    return {
      ...step,
      value: substituteParamsInString(step.value, params),
      match,
    };
  }

  const match = Object.fromEntries(
    Object.entries(step.match).map(([key, value]) => [
      key,
      typeof value === "string" ? substituteParamsInString(value, params) : value,
    ]),
  ) as ElementMatch;
  return { ...step, match };
}

/** Replace {{param}} placeholders in a templated script with runtime values. */
export function instantiateMacroScript(
  script: MacroScript,
  params: MacroParamValues,
): MacroScript {
  return MacroScriptSchema.parse({
    ...script,
    steps: script.steps.map((step) => instantiateStep(step, params)),
  });
}

/** Returns an error message when invalid, otherwise null. */
export function validateMacroParamValues(
  params: MacroParam[],
  values: MacroParamValues,
): string | null {
  for (const param of params) {
    const value = values[param.name]?.trim() ?? "";
    if (!value) {
      return `${param.label} is required.`;
    }
    if (param.type === "number" && !/^\d+$/.test(value)) {
      return `${param.label} must be a number.`;
    }
  }
  return null;
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

  const steps = [...MacroScriptSchema.parse(script).steps];
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

  const signatureError = validateMacroScriptSignature(patchedScript, inferred.params);
  if (signatureError) {
    log.warn("signature invalid after patch, using standalone", { error: signatureError });
    return standalone(script);
  }

  return { script: patchedScript, signature };
}
