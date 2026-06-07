import { MacrosSchema, type Macro } from "@/shared/types/macro";
import { SettingsSchema, type Settings } from "@/shared/types/settings";

const STORAGE_KEYS = {
  settings: "patch:settings",
  macros: "patch:macros",
} as const;

const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const raw = result[STORAGE_KEYS.settings];
  return SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...raw });
}

export async function saveSettings(settings: Settings): Promise<void> {
  const parsed = SettingsSchema.parse(settings);
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: parsed });
}

export async function getMacros(): Promise<Macro[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.macros);
  const raw = result[STORAGE_KEYS.macros];
  return MacrosSchema.parse(raw ?? []);
}

export async function saveMacros(macros: Macro[]): Promise<void> {
  const parsed = MacrosSchema.parse(macros);
  await chrome.storage.local.set({ [STORAGE_KEYS.macros]: parsed });
}
