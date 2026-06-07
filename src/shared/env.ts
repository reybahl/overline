import { z } from "zod";

const LlmEnvSchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export type LlmEnv = z.infer<typeof LlmEnvSchema>;

export function getLlmEnv(): LlmEnv | null {
  const result = LlmEnvSchema.safeParse({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
    model: import.meta.env.VITE_GROQ_MODEL,
  });

  return result.success ? result.data : null;
}
