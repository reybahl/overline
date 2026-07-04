import { z } from "zod";

import type { LlmProvider } from "@/shared/llm/providers";

const sharedPersistedFields = {
  modelId: z.string().min(1),
  apiKey: z.string().min(1),
  updatedAt: z.number(),
};

const OpenAiSettingsSchema = z.object({
  provider: z.literal("openai" satisfies LlmProvider),
  ...sharedPersistedFields,
});

const AnthropicSettingsSchema = z.object({
  provider: z.literal("anthropic" satisfies LlmProvider),
  ...sharedPersistedFields,
});

const XaiSettingsSchema = z.object({
  provider: z.literal("xai" satisfies LlmProvider),
  ...sharedPersistedFields,
});

const GeminiSettingsSchema = z.object({
  provider: z.literal("gemini" satisfies LlmProvider),
  ...sharedPersistedFields,
});

const OpenAiCompatibleSettingsSchema = z.object({
  provider: z.literal("openai-compatible" satisfies LlmProvider),
  ...sharedPersistedFields,
  baseURL: z.string().url(),
  name: z.string().min(1).default("openai-compatible"),
});

export const LlmSettingsSchema = z.discriminatedUnion("provider", [
  OpenAiSettingsSchema,
  AnthropicSettingsSchema,
  XaiSettingsSchema,
  GeminiSettingsSchema,
  OpenAiCompatibleSettingsSchema,
]);

export type LlmSettings = z.infer<typeof LlmSettingsSchema>;

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
  };
}

const draftFields = {
  modelId: z.string().min(1),
  apiKey: z.string().optional(),
};

/** Draft from the options UI — apiKey optional when updating existing config. */
export const LlmSettingsDraftSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("openai" satisfies LlmProvider),
    ...draftFields,
  }),
  z.object({
    provider: z.literal("anthropic" satisfies LlmProvider),
    ...draftFields,
  }),
  z.object({
    provider: z.literal("xai" satisfies LlmProvider),
    ...draftFields,
  }),
  z.object({
    provider: z.literal("gemini" satisfies LlmProvider),
    ...draftFields,
  }),
  z.object({
    provider: z.literal("openai-compatible" satisfies LlmProvider),
    ...draftFields,
    baseURL: z.string().url(),
    name: z.string().min(1).default("openai-compatible"),
  }),
]);

export type LlmSettingsDraft = z.infer<typeof LlmSettingsDraftSchema>;

export function mergeLlmSettingsDraft(
  draft: LlmSettingsDraft,
  existing: LlmSettings | null,
): LlmSettings {
  const apiKey = draft.apiKey?.trim() || existing?.apiKey;
  if (!apiKey) {
    throw new Error("API key is required.");
  }

  const updatedAt = Date.now();
  const { apiKey: _removed, ...rest } = draft;

  if (rest.provider === "openai-compatible") {
    return LlmSettingsSchema.parse({
      ...rest,
      apiKey,
      updatedAt,
    });
  }

  return LlmSettingsSchema.parse({
    ...rest,
    apiKey,
    updatedAt,
  });
}
