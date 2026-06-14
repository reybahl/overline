import { z } from "zod";

import { MacroSchema } from "@/shared/types/macro";

export const PendingRecordSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("recording"),
    intent: z.string(),
    tabId: z.number().int(),
    startUrl: z.string(),
    progress: z.string().optional(),
    startedAt: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal("complete"),
    intent: z.string(),
    macro: MacroSchema,
    reasoning: z.array(z.string()),
    completedAt: z.number().int().nonnegative(),
  }),
  z.object({
    status: z.literal("error"),
    intent: z.string(),
    error: z.string(),
    completedAt: z.number().int().nonnegative(),
  }),
]);

export type PendingRecord = z.infer<typeof PendingRecordSchema>;
