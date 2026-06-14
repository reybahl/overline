import { runMacro } from "@/background/play";
import {
  discardPendingRecordSession,
  startAgenticRecordSession,
} from "@/background/record-session";
import { cancelPendingRecordSession } from "@/background/recording-session";
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
    sender,
    sendResponse: (response: BackgroundResponse) => void,
  ) => {
    void handleMessage(message, sender)
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
  sender?: chrome.runtime.MessageSender,
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
      await handleRunMacroById(message.macroId, sender?.tab?.id);
      return { ok: true };
    case "EXECUTE_MACRO": {
      const tab = await chrome.tabs.get(message.tabId);
      const url = tab.url;
      if (!url) {
        throw new Error("No active tab URL found.");
      }

      const macros = await getMacros();
      const macro = macros.find((entry) => entry.id === message.macroId);
      if (!macro) {
        throw new Error("Macro not found.");
      }
      if (!macroMatchesUrl(macro, url)) {
        throw new Error(`"${macro.name}" does not run on this page.`);
      }

      await runMacro(message.tabId, macro);
      return { ok: true };
    }
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
    case "CANCEL_PENDING_RECORD":
      await cancelPendingRecordSession();
      return { ok: true, pendingRecord: await getPendingRecord() };
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

async function handleRunMacroById(
  macroId: string,
  tabId?: number,
): Promise<void> {
  const tab =
    tabId !== undefined
      ? await chrome.tabs.get(tabId)
      : await requireInjectableActiveTab();
  const resolvedTabId = tab.id;
  const url = tab.url;

  if (resolvedTabId === undefined) {
    throw new Error("No active tab found.");
  }
  if (!url || !isInjectableUrl(url)) {
    throw new Error(getRestrictedPageMessage(url));
  }

  const macros = await getMacros();
  const macro = macros.find((entry) => entry.id === macroId);
  if (!macro) {
    throw new Error("Macro not found.");
  }

  if (!macroMatchesUrl(macro, url)) {
    console.info(
      `[Patch] Shortcut ignored: "${macro.name}" does not match ${url}`,
    );
    return;
  }

  await runMacro(resolvedTabId, macro);
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

  await runMacro(tab.id!, macro);
  console.info(`[Patch] Ran macro "${macro.name}"`);
}
