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

export const MacroGenerationStepSchema = z.object({
  type: MacroStepTypeSchema,
  selector: z.string().optional(),
  value: z.string().optional(),
});

export const MacroGenerationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(MacroGenerationStepSchema).min(1),
});

export type MacroGeneration = z.infer<typeof MacroGenerationSchema>;

export function toMacro(generated: MacroGeneration): Macro {
  const now = Date.now();
  return MacroSchema.parse({
    id: crypto.randomUUID(),
    name: generated.name,
    description: generated.description,
    createdAt: now,
    updatedAt: now,
    steps: generated.steps.map((step) => ({
      ...step,
      id: crypto.randomUUID(),
      timestamp: now,
    })),
  });
}
