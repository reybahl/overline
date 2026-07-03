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
  /**
   * Match a link whose href pathname equals `/${segment}` where segment is taken
   * from the current page URL pathname at playback time (0 = first segment).
   * Use when the clicked link is tied to a parent scope of the current page.
   */
  hrefFromPathSegment: z.number().int().nonnegative().optional(),
  testId: z.string().min(1).optional(),
  /** aria-pressed — for toggle buttons (false = not engaged). */
  pressed: z.boolean().optional(),
});

const ScriptStepLabelSchema = z.object({
  label: z.string().min(1).optional(),
});

export const ScriptClickStepSchema = ScriptStepLabelSchema.extend({
  type: z.literal("click"),
  match: ElementMatchSchema,
  index: z.number().int().nonnegative().optional(),
  /** When true, playback uses CDP trusted input (saved scripts or in-run learn). */
  trustedClick: z.boolean().optional(),
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
