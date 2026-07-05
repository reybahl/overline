import {
  migrateMacrosFromStorage,
  migratePendingRecordRaw,
} from "@/shared/macro-migrate";
import { normalizeShortcut, isReservedPaletteShortcut } from "@/shared/shortcut";
import { MacrosSchema, type Macro } from "@/shared/types/macro";
import {
  PendingRecordSchema,
  type PendingRecord,
} from "@/shared/types/pending-record";

const STORAGE_KEYS = {
  macros: "overline:macros",
  pendingRecord: "overline:pendingRecord",
} as const;

const LEGACY_STORAGE_KEYS = {
  macros: "patch:macros",
  pendingRecord: "patch:pendingRecord",
} as const;

export type StorageKey = keyof typeof STORAGE_KEYS;

export type StorageChange = Partial<Record<StorageKey, true>>;

function buildStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
): StorageChange | null {
  const change: StorageChange = {};

  for (const key of Object.keys(STORAGE_KEYS) as StorageKey[]) {
    if (STORAGE_KEYS[key] in changes || LEGACY_STORAGE_KEYS[key] in changes) {
      change[key] = true;
    }
  }

  return Object.keys(change).length > 0 ? change : null;
}

async function readWithLegacyMigration<T>(
  key: StorageKey,
): Promise<T | undefined> {
  const currentKey = STORAGE_KEYS[key];
  const legacyKey = LEGACY_STORAGE_KEYS[key];
  const result = await chrome.storage.local.get([currentKey, legacyKey]);

  if (result[currentKey] !== undefined) {
    return result[currentKey] as T;
  }

  if (result[legacyKey] === undefined) {
    return undefined;
  }

  await chrome.storage.local.set({ [currentKey]: result[legacyKey] });
  await chrome.storage.local.remove(legacyKey);
  return result[legacyKey] as T;
}

export async function getMacros(): Promise<Macro[]> {
  const raw = await readWithLegacyMigration<unknown>("macros");
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
    if (!macro.shortcut) {
      continue;
    }
    const key = normalizeShortcut(macro.shortcut);
    if (isReservedPaletteShortcut(key)) {
      continue;
    }
    map.set(key, macro.id);
  }

  return map;
}

export async function getPendingRecord(): Promise<PendingRecord | null> {
  const raw = await readWithLegacyMigration<unknown>("pendingRecord");
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

/** Subscribe to persisted extension data changes. Returns an unsubscribe function. */
export function subscribeStorage(
  listener: (change: StorageChange) => void,
): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") {
      return;
    }

    const change = buildStorageChange(changes);
    if (change) {
      listener(change);
    }
  };

  chrome.storage.onChanged.addListener(handler);
  return () => {
    chrome.storage.onChanged.removeListener(handler);
  };
}
