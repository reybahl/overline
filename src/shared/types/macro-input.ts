import { z } from "zod";

/** camelCase identifier used in fill placeholders: {{searchTerm}} */
export const MacroInputNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-zA-Z0-9]*$/, "camelCase identifier");

export const MacroInputTypeSchema = z.enum(["string", "number"]);

export const MacroInputParamSchema = z.object({
  name: MacroInputNameSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  type: MacroInputTypeSchema,
});

export const MacroInputSchemaSchema = z.object({
  version: z.literal(1),
  inputs: z.array(MacroInputParamSchema),
});

export const MacroInputFillBindingSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  inputName: MacroInputNameSchema,
});

/** LLM output for post-compile input inference. */
export const InferredMacroInputsSchema = z.discriminatedUnion("standalone", [
  z.object({
    standalone: z.literal(true),
    inputs: z.array(MacroInputParamSchema).length(0),
    fillBindings: z.array(MacroInputFillBindingSchema).length(0),
  }),
  z.object({
    standalone: z.literal(false),
    inputs: z.array(MacroInputParamSchema).min(1),
    fillBindings: z.array(MacroInputFillBindingSchema).min(1),
  }),
]);

export type MacroInputName = z.infer<typeof MacroInputNameSchema>;
export type MacroInputType = z.infer<typeof MacroInputTypeSchema>;
export type MacroInputParam = z.infer<typeof MacroInputParamSchema>;
export type MacroInputSchema = z.infer<typeof MacroInputSchemaSchema>;
export type MacroInputFillBinding = z.infer<typeof MacroInputFillBindingSchema>;
export type InferredMacroInputs = z.infer<typeof InferredMacroInputsSchema>;

export const STANDALONE_MACRO_INPUT_SCHEMA: MacroInputSchema = {
  version: 1,
  inputs: [],
};
