import {
  LlmSettingsSchema,
  type LlmSettings,
} from "@/shared/llm/settings";

const STORAGE_KEY = "overline:llmSettings";

export async function getLlmSettings(): Promise<LlmSettings | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  if (raw === undefined) {
    return null;
  }

  const parsed = LlmSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveLlmSettings(settings: LlmSettings): Promise<void> {
  const parsed = LlmSettingsSchema.parse(settings);
  await chrome.storage.local.set({ [STORAGE_KEY]: parsed });
}

export async function getLlmSettingsOrThrow(): Promise<LlmSettings> {
  const settings = await getLlmSettings();
  if (!settings) {
    throw new Error("LLM settings not found.");
  }
  return settings;
}
