import { LLM_PROVIDERS, type LlmProvider } from "@/shared/llm/providers";
import {
  LlmSettingsSchema,
  type LlmProviderKeys,
  type LlmSettings,
} from "@/shared/llm/settings";

const SETTINGS_KEY = "overline:llmSettings";
const PROVIDER_KEYS_KEY = "overline:llmProviderKeys";

function parseLlmProviderKeys(raw: unknown): LlmProviderKeys {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const keys: LlmProviderKeys = {};
  for (const provider of LLM_PROVIDERS) {
    const value = record[provider];
    if (typeof value === "string" && value.length > 0) {
      keys[provider] = value;
    }
  }
  return keys;
}

export async function getLlmProviderKeys(): Promise<LlmProviderKeys> {
  const result = await chrome.storage.local.get(PROVIDER_KEYS_KEY);
  return parseLlmProviderKeys(result[PROVIDER_KEYS_KEY]);
}

export async function saveLlmProviderKey(
  provider: LlmProvider,
  apiKey: string,
): Promise<void> {
  const keys = await getLlmProviderKeys();
  await chrome.storage.local.set({
    [PROVIDER_KEYS_KEY]: { ...keys, [provider]: apiKey },
  });
}

export async function getLlmSettings(): Promise<LlmSettings | null> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const raw = result[SETTINGS_KEY];
  if (raw === undefined) {
    return null;
  }

  const parsed = LlmSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveLlmSettings(settings: LlmSettings): Promise<void> {
  const parsed = LlmSettingsSchema.parse(settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: parsed });
  await saveLlmProviderKey(settings.provider, settings.apiKey);
}

export async function getLlmSettingsOrThrow(): Promise<LlmSettings> {
  const settings = await getLlmSettings();
  if (!settings) {
    throw new Error("LLM settings not found.");
  }
  return settings;
}
