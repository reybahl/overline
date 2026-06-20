import { z } from "zod";

import {
  getProviderApiKey,
  parseModelRef,
  type LlmProvider,
} from "@/shared/llm-model";

const LlmEnvSchema = z.object({
  model: z.string().min(1),
  provider: z.enum(["groq", "xai"]),
  apiKey: z.string().min(1),
});

export type LlmEnv = z.infer<typeof LlmEnvSchema>;

function readConfiguredModel(): string | undefined {
  return import.meta.env.VITE_LLM_MODEL ?? import.meta.env.VITE_GROQ_MODEL;
}

export function getLlmEnv(): LlmEnv | null {
  const model = readConfiguredModel();
  if (!model) {
    return null;
  }

  let provider: LlmProvider;
  try {
    provider = parseModelRef(model).provider;
  } catch {
    return null;
  }

  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    return null;
  }

  const result = LlmEnvSchema.safeParse({ model, provider, apiKey });
  return result.success ? result.data : null;
}

export function llmConfigHint(): string {
  return [
    "Set VITE_LLM_MODEL and the matching API key in .env.",
  ].join("\n");
}
