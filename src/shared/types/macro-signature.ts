import { z } from "zod";

/** camelCase identifier used in script templates: {{prNumber}} */
export const MacroParamNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-zA-Z0-9]*$/, "camelCase identifier");

export const MacroParamTypeSchema = z.enum(["string", "number"]);

export const MacroParamSchema = z.object({
  name: MacroParamNameSchema,
  label: z.string().min(1),
  description: z.string().optional(),
  type: MacroParamTypeSchema,
});

export const MacroSignatureSchema = z.object({
  version: z.literal(1),
  params: z.array(MacroParamSchema),
});

/** Templatable string field on a compiled script step. */
export const MacroScriptPatchFieldSchema = z.enum([
  "value",
  "match.id",
  "match.ariaLabel",
  "match.text",
  "match.textContains",
  "match.hrefSuffix",
  "match.hrefContains",
  "match.hrefPattern",
]);

export const MacroParamPatchSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  field: MacroScriptPatchFieldSchema,
  /** Full field value after parameterization, containing {{paramName}}. */
  template: z.string().min(1),
});

/** LLM output for post-compile signature inference. */
export const InferredMacroSignatureSchema = z.discriminatedUnion("standalone", [
  z.object({
    standalone: z.literal(true),
    params: z.array(MacroParamSchema).length(0),
    patches: z.array(MacroParamPatchSchema).length(0),
  }),
  z.object({
    standalone: z.literal(false),
    params: z.array(MacroParamSchema).min(1),
    patches: z.array(MacroParamPatchSchema).min(1),
  }),
]);

export type MacroParamName = z.infer<typeof MacroParamNameSchema>;
export type MacroParamType = z.infer<typeof MacroParamTypeSchema>;
export type MacroParam = z.infer<typeof MacroParamSchema>;
export type MacroSignature = z.infer<typeof MacroSignatureSchema>;
export type MacroScriptPatchField = z.infer<typeof MacroScriptPatchFieldSchema>;
export type MacroParamPatch = z.infer<typeof MacroParamPatchSchema>;
export type InferredMacroSignature = z.infer<typeof InferredMacroSignatureSchema>;

export const STANDALONE_MACRO_SIGNATURE: MacroSignature = {
  version: 1,
  params: [],
};
