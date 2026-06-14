import { runMacroSteps } from "@/background/play";
import {
  discardPendingRecordSession,
  startAgenticRecordSession,
} from "@/background/record-session";
import { generateMacro } from "@/background/worker";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";
import { findMacroForUrl, macroMatchesUrl } from "@/shared/macro-match";
import { normalizeShortcut } from "@/shared/shortcut";
import { validateRunScopePattern } from "@/shared/run-scope";
import {
  getMacros,
  getPendingRecord,
  getSettings,
  saveMacros,
  saveSettings,
} from "@/shared/storage";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";

chrome.runtime.onInstalled.addListener(() => {
  console.info("[Patch] Extension installed");
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    switch (command) {
      case "record-macro":
        console.warn("[Patch] Use the popup to record macros.");
        break;
      case "run-macro":
        await handleRunMacro();
        break;
      default:
        console.warn(`[Patch] Unknown command: ${command}`);
    }
  } catch (error) {
    console.error("[Patch] Command failed:", error);
  }
});

chrome.runtime.onMessage.addListener(
  (
    message: BackgroundMessage,
    _sender,
    sendResponse: (response: BackgroundResponse) => void,
  ) => {
    void handleMessage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown background error";
        sendResponse({ ok: false, error: errorMessage });
      });

    return true;
  },
);

async function handleMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  const messageType = message.type;

  switch (messageType) {
    case "GET_SETTINGS":
      return { ok: true, settings: await getSettings() };
    case "SAVE_SETTINGS":
      await saveSettings(message.settings);
      return { ok: true };
    case "GET_MACROS":
      return { ok: true, macros: await getMacros() };
    case "SAVE_MACRO": {
      const macros = await getMacros();
      const index = macros.findIndex((macro) => macro.id === message.macro.id);
      const isNew = index < 0;

      if (message.macro.runScope) {
        const patternError = validateRunScopePattern(message.macro.runScope.pattern);
        if (patternError) {
          throw new Error(`Invalid run scope regex: ${patternError}`);
        }
      }

      if (message.macro.shortcut) {
        const normalized = normalizeShortcut(message.macro.shortcut);
        const conflict = macros.find(
          (macro) =>
            macro.id !== message.macro.id &&
            macro.shortcut &&
            normalizeShortcut(macro.shortcut) === normalized,
        );
        if (conflict) {
          throw new Error(
            `Shortcut already used by "${conflict.name}". Choose a different one.`,
          );
        }
      }

      if (index >= 0) {
        macros[index] = message.macro;
      } else {
        macros.push(message.macro);
      }
      await saveMacros(macros);

      if (isNew) {
        const settings = await getSettings();
        await saveSettings({
          ...settings,
          currentMacroId: message.macro.id,
        });
      }

      return { ok: true, macros };
    }
    case "DELETE_MACRO": {
      const macros = (await getMacros()).filter(
        (macro) => macro.id !== message.macroId,
      );
      await saveMacros(macros);

      const settings = await getSettings();
      if (settings.currentMacroId === message.macroId) {
        await saveSettings({
          ...settings,
          currentMacroId: null,
        });
      }

      return { ok: true, macros };
    }
    case "RECORD_MACRO":
      throw new Error("Use the popup to record macros.");
    case "RUN_MACRO":
      await handleRunMacro();
      return { ok: true };
    case "RUN_MACRO_BY_ID":
      await handleRunMacroById(message.macroId);
      return { ok: true };
    case "EXECUTE_MACRO":
      await runMacroSteps(message.tabId, message.steps);
      return { ok: true };
    case "GENERATE_MACRO": {
      const macro = await generateMacro(
        message.intent,
        message.elements,
        message.url,
      );
      console.info("[Patch] Generated macro:", macro);
      return { ok: true, macro };
    }
    case "AGENTIC_RECORD":
    case "START_AGENTIC_RECORD": {
      await startAgenticRecordSession(
        message.intent,
        message.tabId,
        message.startUrl,
      );
      return { ok: true };
    }
    case "GET_PENDING_RECORD":
      return { ok: true, pendingRecord: await getPendingRecord() };
    case "CLEAR_PENDING_RECORD":
      await discardPendingRecordSession();
      return { ok: true, pendingRecord: null };
    default:
      return {
        ok: false,
        error: `Unknown message type "${messageType}". Reload Patch at chrome://extensions and try again.`,
      };
  }
}

async function requireInjectableActiveTab(): Promise<chrome.tabs.Tab> {
  const tab = await getActiveTab();
  if (!isInjectableUrl(tab.url)) {
    throw new Error(getRestrictedPageMessage(tab.url));
  }
  return tab;
}

async function handleRunMacroById(macroId: string): Promise<void> {
  const tab = await requireInjectableActiveTab();
  const url = tab.url;
  if (!url) {
    throw new Error("No active tab URL found.");
  }

  const macros = await getMacros();
  const macro = macros.find((entry) => entry.id === macroId);
  if (!macro) {
    throw new Error("Macro not found.");
  }

  if (!macroMatchesUrl(macro, url)) {
    console.info(
      `[Patch] Shortcut ignored: "${macro.name}" does not match this page.`,
    );
    return;
  }

  await runMacroSteps(tab.id!, macro.steps);
  console.info(`[Patch] Ran macro "${macro.name}" via shortcut`);
}

async function handleRunMacro(): Promise<void> {
  const tab = await requireInjectableActiveTab();
  const url = tab.url;
  if (!url) {
    throw new Error("No active tab URL found.");
  }

  const [macros, settings] = await Promise.all([getMacros(), getSettings()]);
  const macro = findMacroForUrl(macros, url, settings.currentMacroId);
  if (!macro) {
    throw new Error("No macro matches this page. Record one on this URL first.");
  }

  await runMacroSteps(tab.id!, macro.steps);
  console.info(`[Patch] Ran macro "${macro.name}"`);
}
