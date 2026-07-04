import { z } from "zod";

import { LLM_PROVIDERS, type LlmProvider } from "@/shared/llm/providers";

type StandardLlmProvider = Exclude<LlmProvider, "openai-compatible">;

const standardProviderSchema = z.enum(
  LLM_PROVIDERS.filter(
    (provider): provider is StandardLlmProvider => provider !== "openai-compatible",
  ) as [StandardLlmProvider, ...StandardLlmProvider[]],
);

const persistedFields = {
  modelId: z.string().min(1),
  apiKey: z.string().min(1),
  updatedAt: z.number(),
} as const;

const draftFields = {
  modelId: z.string().min(1),
  apiKey: z.string().optional(),
} as const;

const openAiCompatibleFields = {
  baseURL: z.string().url(),
  name: z.string().min(1).default("openai-compatible"),
} as const;

function llmSettingsSchema<const F extends Record<string, z.ZodTypeAny>>(fields: F) {
  return z.union([
    z.object({
      provider: standardProviderSchema,
      ...fields,
    }),
    z.object({
      provider: z.literal("openai-compatible"),
      ...fields,
      ...openAiCompatibleFields,
    }),
  ]);
}

type LlmSettingsForProvider<
  P extends LlmProvider,
  Fields extends { modelId: string },
> = Fields &
  (P extends "openai-compatible"
    ? { provider: P; baseURL: string; name: string }
    : { provider: P });

export type LlmSettings = LlmSettingsForProvider<
  LlmProvider,
  { modelId: string; apiKey: string; updatedAt: number }
>;

export const LlmSettingsSchema = llmSettingsSchema(
  persistedFields,
) as z.ZodType<LlmSettings>;

/** Settings safe to return to the options page (apiKey masked). */
export type LlmSettingsPublic = {
  [K in LlmProvider]: Omit<Extract<LlmSettings, { provider: K }>, "apiKey"> & {
    apiKeyMasked: string;
  };
}[LlmProvider];

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 4) {
    return "••••";
  }
  return `…${apiKey.slice(-4)}`;
}

export function toPublicLlmSettings(settings: LlmSettings): LlmSettingsPublic {
  const { apiKey, ...rest } = settings;
  return {
    ...rest,
    apiKeyMasked: maskApiKey(apiKey),
  } as LlmSettingsPublic;
}

export type LlmSettingsDraft = LlmSettingsForProvider<
  LlmProvider,
  { modelId: string; apiKey?: string | undefined }
>;

/** Draft from the options UI — apiKey optional when updating existing config. */
export const LlmSettingsDraftSchema = llmSettingsSchema(
  draftFields,
) as z.ZodType<LlmSettingsDraft>;

export function mergeLlmSettingsDraft(
  draft: LlmSettingsDraft,
  existing: LlmSettings | null,
): LlmSettings {
  const apiKey = draft.apiKey?.trim() || existing?.apiKey;
  if (!apiKey) {
    throw new Error("API key is required.");
  }

  const { apiKey: _removed, ...rest } = draft;
  return LlmSettingsSchema.parse({
    ...rest,
    apiKey,
    updatedAt: Date.now(),
  });
}
