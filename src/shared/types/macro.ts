import { z } from "zod";

import { deriveUrlPattern } from "@/shared/macro-match";
import { MacroSignatureSchema } from "@/shared/types/macro-signature";
import {
  ElementMatchSchema,
  MacroScriptSchema,
  type MacroScript,
} from "@/shared/types/script";

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
  recordedMatch: ElementMatchSchema.optional(),
  /** Page URL when the step was executed — helps compile generalize href matches. */
  pageUrl: z.string().url().optional(),
  timestamp: z.number().int().nonnegative(),
});

export const RunScopeSchema = z.object({
  pattern: z.string().min(1),
  description: z.string().min(1),
});

export const MacroSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  intent: z.string().min(1).optional(),
  script: MacroScriptSchema.optional(),
  urlPattern: z.string().min(1).optional(),
  runScope: RunScopeSchema.optional(),
  /** Runtime parameters inferred from intent; empty params = standalone. */
  signature: MacroSignatureSchema.optional(),
  shortcut: z.string().min(1).optional(),
  steps: z.array(MacroStepSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type MacroStepType = z.infer<typeof MacroStepTypeSchema>;
export type MacroStep = z.infer<typeof MacroStepSchema>;
export type RunScope = z.infer<typeof RunScopeSchema>;
export type Macro = z.infer<typeof MacroSchema>;

/** User-editable macro fields shown in the JSON settings editor. */
export const MacroEditableDocumentSchema = MacroSchema.pick({
  name: true,
  description: true,
  runScope: true,
  shortcut: true,
  signature: true,
  script: true,
});

export type MacroEditableDocument = z.infer<typeof MacroEditableDocumentSchema>;

export const macroEditableFieldKeys = Object.keys(
  MacroEditableDocumentSchema.shape,
) as (keyof MacroEditableDocument)[];

export const MacrosSchema = z.array(MacroSchema);

export const MacroGenerationStepSchema = z.object({
  type: MacroStepTypeSchema,
  selector: z.string().optional(),
  value: z.string().optional(),
});

export type MacroGenerationStep = z.infer<typeof MacroGenerationStepSchema>;

export const CompiledMacroOutputSchema = z.object({
  script: MacroScriptSchema,
  description: z.string().min(1),
});

export type CompiledMacroOutput = z.infer<typeof CompiledMacroOutputSchema>;

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
  options?: { description?: string; intent?: string; script?: MacroScript },
): Macro {
  const now = Date.now();
  return MacroSchema.parse({
    id: crypto.randomUUID(),
    name,
    description: options?.description,
    intent: options?.intent,
    script: options?.script,
    urlPattern: deriveUrlPattern(url),
    createdAt: now,
    updatedAt: now,
    steps,
  });
}
