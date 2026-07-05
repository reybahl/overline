import { sendBackgroundMessage } from "@/shared/clients/background-client";
import {
  getShortcutMap,
  subscribeStorage,
} from "@/shared/clients/storage";
import {
  eventToShortcut,
  isEditableTarget,
  normalizeShortcut,
} from "@/shared/shortcut";

declare global {
  interface Window {
    __olShortcutsLoaded?: boolean;
  }
}

let shortcutToMacroId = new Map<string, string>();

async function refreshShortcutMap(): Promise<void> {
  shortcutToMacroId = await getShortcutMap();
}

async function triggerMacroByShortcut(macroId: string): Promise<void> {
  const message = { type: "RUN_MACRO_BY_ID", macroId } as const;

  try {
    await sendBackgroundMessage(message);
    return;
  } catch {
    // Service worker may still be waking on a cold tab.
  }

  await new Promise((resolve) => {
    window.setTimeout(resolve, 50);
  });

  await sendBackgroundMessage(message);
}

function resolveMacroId(shortcut: string): string | undefined {
  return shortcutToMacroId.get(normalizeShortcut(shortcut));
}

function initializeShortcutsContentScript(): void {
  if (window.__olShortcutsLoaded) {
    return;
  }
  window.__olShortcutsLoaded = true;

  void refreshShortcutMap().then(() => {
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

        const macroId = resolveMacroId(shortcut);
        if (!macroId) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        void triggerMacroByShortcut(macroId);
      },
      true,
    );
  });

  subscribeStorage((change) => {
    if (change.macros) {
      void refreshShortcutMap();
    }
  });
}

initializeShortcutsContentScript();
