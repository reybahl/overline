import { z } from "zod";

export const ElementMatchSchema = z.object({
  tag: z.enum(["a", "button", "input", "select", "textarea"]).optional(),
  id: z.string().min(1).optional(),
  ariaLabel: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  textContains: z.string().min(1).optional(),
  hrefSuffix: z.string().min(1).optional(),
  hrefContains: z.string().min(1).optional(),
  /** Regex tested against the anchor href, e.g. "/issues/\\d+" for issue links. */
  hrefPattern: z.string().min(1).optional(),
  testId: z.string().min(1).optional(),
});

const ScriptStepLabelSchema = z.object({
  label: z.string().min(1).optional(),
});

export const ScriptClickStepSchema = ScriptStepLabelSchema.extend({
  type: z.literal("click"),
  match: ElementMatchSchema,
  index: z.number().int().nonnegative().optional(),
});

export const ScriptFillStepSchema = ScriptStepLabelSchema.extend({
  type: z.literal("fill"),
  match: ElementMatchSchema,
  value: z.string(),
});

export const ScriptWaitStepSchema = ScriptStepLabelSchema.extend({
  type: z.literal("wait"),
  ms: z.number().int().nonnegative(),
});

export const ScriptWaitForStepSchema = ScriptStepLabelSchema.extend({
  type: z.literal("waitFor"),
  match: ElementMatchSchema,
  timeoutMs: z.number().int().positive().optional(),
});

export const ScriptStepSchema = z.discriminatedUnion("type", [
  ScriptClickStepSchema,
  ScriptFillStepSchema,
  ScriptWaitStepSchema,
  ScriptWaitForStepSchema,
]);

export const MacroScriptSchema = z.object({
  version: z.literal(1),
  steps: z.array(ScriptStepSchema).min(1),
});

export type ElementMatch = z.infer<typeof ElementMatchSchema>;
export type ScriptClickStep = z.infer<typeof ScriptClickStepSchema>;
export type ScriptFillStep = z.infer<typeof ScriptFillStepSchema>;
export type ScriptWaitStep = z.infer<typeof ScriptWaitStepSchema>;
export type ScriptWaitForStep = z.infer<typeof ScriptWaitForStepSchema>;
export type ScriptStep = z.infer<typeof ScriptStepSchema>;
export type MacroScript = z.infer<typeof MacroScriptSchema>;
