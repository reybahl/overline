import { createLogger } from "@/shared/logger";
import {
  MacroInputSchemaSchema,
  STANDALONE_MACRO_INPUT_SCHEMA,
  type InferredMacroInputs,
  type MacroInputSchema,
} from "@/shared/types/macro-input";
import type { Macro } from "@/shared/types/macro";
import { MacroScriptSchema, type MacroScript } from "@/shared/types/script";

const log = createLogger("macro-input");

/** Matches {{paramName}} placeholders in fill values. */
export const FILL_PARAM_PLACEHOLDER_RE = /\{\{([a-z][a-zA-Z0-9]*)\}\}/g;

export function macroNeedsInputs(macro: Macro): boolean {
  return (macro.inputSchema?.inputs.length ?? 0) > 0;
}

export function extractFillParamNames(script: MacroScript): Set<string> {
  const names = new Set<string>();

  for (const step of script.steps) {
    if (step.type !== "fill") {
      continue;
    }

    for (const match of step.value.matchAll(FILL_PARAM_PLACEHOLDER_RE)) {
      names.add(match[1]);
    }
  }

  return names;
}

/** Returns an error message when invalid, otherwise null. */
export function validateMacroInputSchema(
  script: MacroScript,
  inputSchema: MacroInputSchema,
): string | null {
  const parsedSchema = MacroInputSchemaSchema.safeParse(inputSchema);
  if (!parsedSchema.success) {
    return parsedSchema.error.message;
  }

  const schema = parsedSchema.data;
  const declared = new Set<string>();
  for (const input of schema.inputs) {
    if (declared.has(input.name)) {
      return `duplicate input name: ${input.name}`;
    }
    declared.add(input.name);
  }

  const referenced = extractFillParamNames(script);

  for (const name of referenced) {
    if (!declared.has(name)) {
      return `script references undeclared input: ${name}`;
    }
  }

  for (const input of schema.inputs) {
    if (!referenced.has(input.name)) {
      return `declared input never used in script: ${input.name}`;
    }
  }

  if (schema.inputs.length === 0 && referenced.size > 0) {
    return "script has placeholders but input schema is empty";
  }

  if (schema.inputs.length > 0 && referenced.size === 0) {
    return "input schema declares inputs but script has no placeholders";
  }

  return null;
}

function cloneScript(script: MacroScript): MacroScript {
  return MacroScriptSchema.parse(script);
}

function validateBindings(
  script: MacroScript,
  inferred: Extract<InferredMacroInputs, { standalone: false }>,
): string | null {
  const inputNames = new Set(inferred.inputs.map((input) => input.name));
  const boundSteps = new Set<number>();

  for (const binding of inferred.fillBindings) {
    if (!inputNames.has(binding.inputName)) {
      return `binding references undeclared input: ${binding.inputName}`;
    }

    if (binding.stepIndex >= script.steps.length) {
      return `binding stepIndex out of range: ${binding.stepIndex}`;
    }

    const step = script.steps[binding.stepIndex];
    if (step.type !== "fill") {
      return `binding targets non-fill step at index ${binding.stepIndex}`;
    }

    if (boundSteps.has(binding.stepIndex)) {
      return `duplicate binding for step index ${binding.stepIndex}`;
    }
    boundSteps.add(binding.stepIndex);
  }

  return null;
}

export type AppliedMacroInputs = {
  script: MacroScript;
  inputSchema: MacroInputSchema;
};

function standaloneResult(script: MacroScript): AppliedMacroInputs {
  return {
    script,
    inputSchema: STANDALONE_MACRO_INPUT_SCHEMA,
  };
}

/**
 * Apply LLM input inference to a compiled script. On any inconsistency, fall back
 * to standalone (original script, empty inputs).
 */
export function applyInferredMacroInputs(
  script: MacroScript,
  inferred: InferredMacroInputs,
): AppliedMacroInputs {
  if (inferred.standalone) {
    return standaloneResult(script);
  }

  const bindingError = validateBindings(script, inferred);
  if (bindingError) {
    log.warn("input bindings invalid, using standalone", { error: bindingError });
    return standaloneResult(script);
  }

  const patched = cloneScript(script);
  const steps = [...patched.steps];

  for (const binding of inferred.fillBindings) {
    const step = steps[binding.stepIndex];
    if (step.type !== "fill") {
      log.warn("input bindings invalid, using standalone", {
        error: `expected fill at index ${binding.stepIndex}`,
      });
      return standaloneResult(script);
    }

    steps[binding.stepIndex] = {
      ...step,
      value: `{{${binding.inputName}}}`,
    };
  }

  const patchedScript: MacroScript = { ...patched, steps };
  const inputSchema: MacroInputSchema = {
    version: 1,
    inputs: inferred.inputs,
  };

  const schemaError = validateMacroInputSchema(patchedScript, inputSchema);
  if (schemaError) {
    log.warn("input schema invalid after patch, using standalone", {
      error: schemaError,
    });
    return standaloneResult(script);
  }

  return { script: patchedScript, inputSchema };
}
