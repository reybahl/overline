import { z } from "zod";

import { deriveUrlPattern } from "@/shared/macro-match";

export const MacroStepTypeSchema = z.enum([
  "click",
  "type",
  "fill",
  "confirm",
  "navigate",
  "wait",
  "waitFor",
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
  urlPattern: z.string().min(1).optional(),
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

export type MacroGenerationStep = z.infer<typeof MacroGenerationStepSchema>;
export type MacroGeneration = z.infer<typeof MacroGenerationSchema>;

export const AgentTurnSchema = z.object({
  step: MacroGenerationStepSchema,
  done: z.boolean(),
  reasoning: z.string().optional(),
  macroName: z.string().optional(),
});

export type AgentTurn = z.infer<typeof AgentTurnSchema>;

export function toRecordedStep(step: MacroGenerationStep): MacroStep {
  return MacroStepSchema.parse({
    ...step,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  });
}

export function createMacroPreview(
  name: string,
  steps: MacroStep[],
  url: string,
  description?: string,
): Macro {
  const now = Date.now();
  return MacroSchema.parse({
    id: crypto.randomUUID(),
    name,
    description,
    urlPattern: deriveUrlPattern(url),
    createdAt: now,
    updatedAt: now,
    steps,
  });
}

export function toMacro(generated: MacroGeneration, url: string): Macro {
  const now = Date.now();
  return MacroSchema.parse({
    id: crypto.randomUUID(),
    name: generated.name,
    description: generated.description,
    urlPattern: deriveUrlPattern(url),
    createdAt: now,
    updatedAt: now,
    steps: generated.steps.map((step) => ({
      ...step,
      id: crypto.randomUUID(),
      timestamp: now,
    })),
  });
}
