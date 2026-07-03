import {
  migrateMacrosFromStorage,
  migratePendingRecordRaw,
} from "@/shared/macro-migrate";
import { normalizeShortcut } from "@/shared/shortcut";
import { MacrosSchema, type Macro } from "@/shared/types/macro";
import {
  PendingRecordSchema,
  type PendingRecord,
} from "@/shared/types/pending-record";

const STORAGE_KEYS = {
  macros: "patch:macros",
  pendingRecord: "patch:pendingRecord",
} as const;

export type PatchStorageKey = keyof typeof STORAGE_KEYS;

export type PatchStorageChange = Partial<Record<PatchStorageKey, true>>;

function buildPatchStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
): PatchStorageChange | null {
  const change: PatchStorageChange = {};

  for (const key of Object.keys(STORAGE_KEYS) as PatchStorageKey[]) {
    if (STORAGE_KEYS[key] in changes) {
      change[key] = true;
    }
  }

  return Object.keys(change).length > 0 ? change : null;
}

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

export async function getShortcutMap(): Promise<Map<string, string>> {
  const macros = await getMacros();
  const map = new Map<string, string>();

  for (const macro of macros) {
    if (macro.shortcut) {
      map.set(normalizeShortcut(macro.shortcut), macro.id);
    }
  }

  return map;
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

/** Subscribe to persisted Patch data changes. Returns an unsubscribe function. */
export function subscribePatchStorage(
  listener: (change: PatchStorageChange) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") {
      return;
    }

    const change = buildPatchStorageChange(changes);
    if (change) {
      listener(change);
    }
  };

  chrome.storage.onChanged.addListener(handler);
  return () => {
    chrome.storage.onChanged.removeListener(handler);
  };
}
