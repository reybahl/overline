import { z } from "zod";

/** camelCase identifier used in script templates: {{prNumber}} */
export const MacroParamNameSchema = z
  .string()
  .min(1, "Param name is required.")
  .regex(
    /^[a-z][a-zA-Z0-9]*$/,
    'Use camelCase: start with a lowercase letter, then letters or digits (e.g. "prNumber").',
  );

export const MacroParamTypeSchema = z.enum(["string", "number"]);

export const MacroParamSchema = z.object({
  name: MacroParamNameSchema.describe(
    "camelCase param id used in templates as {{name}}",
  ),
  label: z.string().min(1).describe("Short human label for the runtime prompt"),
  description: z.string().optional().describe("Optional helper text for the prompt"),
  type: MacroParamTypeSchema.describe("number for numeric ids; string for free text"),
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
  stepIndex: z
    .number()
    .int()
    .nonnegative()
    .describe("Index in the compiled script steps array"),
  field: MacroScriptPatchFieldSchema.describe(
    "Script field to replace with template; prefer match.hrefContains/hrefSuffix when href carries the demo literal",
  ),
  template: z
    .string()
    .min(1)
    .describe(
      "Full new field value containing {{paramName}}, e.g. /items/{{itemNumber}} or item_{{itemNumber}}_link or {{searchTerm}}",
    ),
});

/** LLM output for post-compile signature inference. Flat object — discriminated unions break generateObject JSON schema. */
export const InferredMacroSignatureSchema = z.object({
  standalone: z
    .boolean()
    .describe(
      "false when intent explicitly marks user-provided values; true for fixed macros with no runtime params",
    ),
  params: z
    .array(MacroParamSchema)
    .describe("Runtime param metadata; empty array when standalone is true"),
  patches: z
    .array(MacroParamPatchSchema)
    .describe("Script field templates with {{param}}; empty array when standalone is true"),
});

export type InferredMacroSignature = z.infer<typeof InferredMacroSignatureSchema>;

export type MacroParamName = z.infer<typeof MacroParamNameSchema>;
export type MacroParamType = z.infer<typeof MacroParamTypeSchema>;
export type MacroParam = z.infer<typeof MacroParamSchema>;
export type MacroSignature = z.infer<typeof MacroSignatureSchema>;
export type MacroScriptPatchField = z.infer<typeof MacroScriptPatchFieldSchema>;
export type MacroParamPatch = z.infer<typeof MacroParamPatchSchema>;

export const STANDALONE_MACRO_SIGNATURE: MacroSignature = {
  version: 1,
  params: [],
};
