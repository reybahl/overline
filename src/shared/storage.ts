import {
  migrateMacrosFromStorage,
  migratePendingRecordRaw,
} from "@/shared/macro-migrate";
import { MacrosSchema, type Macro } from "@/shared/types/macro";
import {
  PendingRecordSchema,
  type PendingRecord,
} from "@/shared/types/pending-record";
const STORAGE_KEYS = {
  macros: "patch:macros",
  pendingRecord: "patch:pendingRecord",
} as const;

export async function getMacros(): Promise<Macro[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.macros);
  const raw = result[STORAGE_KEYS.macros];
  const { macros, changed } = migrateMacrosFromStorage(raw ?? []);

  if (changed) {
    await chrome.storage.local.set({ [STORAGE_KEYS.macros]: macros });
  }

  return MacrosSchema.parse(macros);
}

export async function saveMacros(macros: Macro[]): Promise<void> {
  const parsed = MacrosSchema.parse(macros);
  await chrome.storage.local.set({ [STORAGE_KEYS.macros]: parsed });
}

export async function getPendingRecord(): Promise<PendingRecord | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.pendingRecord);
  const raw = result[STORAGE_KEYS.pendingRecord];
  if (!raw) {
    return null;
  }

  const { record, changed } = migratePendingRecordRaw(raw);
  if (changed) {
    if (record) {
      await chrome.storage.local.set({ [STORAGE_KEYS.pendingRecord]: record });
    } else {
      await chrome.storage.local.remove(STORAGE_KEYS.pendingRecord);
    }
  }

  if (!record) {
    return null;
  }

  return PendingRecordSchema.parse(record);
}

export async function savePendingRecord(record: PendingRecord): Promise<void> {
  const parsed = PendingRecordSchema.parse(record);
  await chrome.storage.local.set({ [STORAGE_KEYS.pendingRecord]: parsed });
}

export async function clearPendingRecord(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.pendingRecord);
}
