import {
  eventToShortcut,
  isEditableTarget,
  normalizeShortcut,
} from "@/shared/shortcut";

const MACROS_STORAGE_KEY = "patch:macros";

type StoredMacro = {
  id?: string;
  shortcut?: string;
};

declare global {
  interface Window {
    __patchShortcutsLoaded?: boolean;
  }
}

let shortcutToMacroId = new Map<string, string>();

function loadShortcutMap(raw: unknown): void {
  if (!Array.isArray(raw)) {
    shortcutToMacroId = new Map();
    return;
  }

  const nextMap = new Map<string, string>();
  for (const entry of raw) {
    const macro = entry as StoredMacro;
    if (!macro.id || !macro.shortcut) {
      continue;
    }

    nextMap.set(normalizeShortcut(macro.shortcut), macro.id);
  }

  shortcutToMacroId = nextMap;
}

async function refreshShortcutMap(): Promise<void> {
  const result = await chrome.storage.local.get(MACROS_STORAGE_KEY);
  loadShortcutMap(result[MACROS_STORAGE_KEY]);
}

async function triggerMacroByShortcut(macroId: string): Promise<void> {
  const message = { type: "RUN_MACRO_BY_ID", macroId };

  try {
    await chrome.runtime.sendMessage(message);
    return;
  } catch {
    // Service worker may still be waking on a cold tab.
  }

  await new Promise((resolve) => {
    window.setTimeout(resolve, 50);
  });

  await chrome.runtime.sendMessage(message);
}

async function resolveMacroId(shortcut: string): Promise<string | undefined> {
  let macroId = shortcutToMacroId.get(normalizeShortcut(shortcut));
  if (macroId) {
    return macroId;
  }

  await refreshShortcutMap();
  return shortcutToMacroId.get(normalizeShortcut(shortcut));
}

function initializeShortcutsContentScript(): void {
  if (window.__patchShortcutsLoaded) {
    return;
  }
  window.__patchShortcutsLoaded = true;

  void refreshShortcutMap().then(() => {
    document.addEventListener(
      "keydown",
      (event) => {
        void (async () => {
          if (event.repeat || isEditableTarget(event.target)) {
            return;
          }

          const shortcut = eventToShortcut(event);
          if (!shortcut) {
            return;
          }

          const macroId = await resolveMacroId(shortcut);
          if (!macroId) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();

          void triggerMacroByShortcut(macroId);
        })();
      },
      true,
    );
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(MACROS_STORAGE_KEY in changes)) {
      return;
    }

    loadShortcutMap(changes[MACROS_STORAGE_KEY]?.newValue);
  });
}

initializeShortcutsContentScript();
