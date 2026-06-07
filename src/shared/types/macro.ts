import { z } from "zod";

export const MacroStepTypeSchema = z.enum([
  "click",
  "type",
  "navigate",
  "wait",
  "scroll",
]);

export const MacroStepSchema = z.object({
  id: z.string().uuid(),
  type: MacroStepTypeSchema,
  selector: z.string().optional(),
  value: z.string().optional(),
  timestamp: z.number().int().nonnegative(),
});

export const MacroSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(MacroStepSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type MacroStepType = z.infer<typeof MacroStepTypeSchema>;
export type MacroStep = z.infer<typeof MacroStepSchema>;
export type Macro = z.infer<typeof MacroSchema>;

export const MacrosSchema = z.array(MacroSchema);
