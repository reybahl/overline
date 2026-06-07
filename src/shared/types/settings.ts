import { z } from "zod";

export const SettingsSchema = z.object({
  currentMacroId: z.string().uuid().nullable().default(null),
});

export type Settings = z.infer<typeof SettingsSchema>;
