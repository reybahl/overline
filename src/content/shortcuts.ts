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

void refreshShortcutMap();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !(MACROS_STORAGE_KEY in changes)) {
    return;
  }

  loadShortcutMap(changes[MACROS_STORAGE_KEY]?.newValue);
});

document.addEventListener(
  "keydown",
  (event) => {
    if (event.repeat || isEditableTarget(event.target)) {
      return;
    }

    const shortcut = eventToShortcut(event);
    if (!shortcut) {
      return;
    }

    const macroId = shortcutToMacroId.get(normalizeShortcut(shortcut));
    if (!macroId) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    void chrome.runtime.sendMessage({
      type: "RUN_MACRO_BY_ID",
      macroId,
    });
  },
  true,
);
