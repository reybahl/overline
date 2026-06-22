import { togglePatchOverlay } from "@/background/overlay";
import { relayLogEntry } from "@/background/log-relay";
import { runMacro } from "@/background/play";
import {
  discardPendingRecordSession,
  startAgenticRecordSession,
} from "@/background/record-session";
import { cancelPendingRecordSession } from "@/background/recording-session";
import { bindLogRelay, createLogger } from "@/shared/logger";
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

const log = createLogger("bg");

bindLogRelay(relayLogEntry);

chrome.runtime.onInstalled.addListener(() => {
  log.info("extension installed");
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) {
    return;
  }

  void togglePatchOverlay(tab.id, tab.url).catch((error: unknown) => {
    log.error("failed to open patch overlay", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    switch (command) {
      case "open-patch": {
        const tab = await getActiveTab();
        if (tab.id === undefined) {
          throw new Error("No active tab found.");
        }
        await togglePatchOverlay(tab.id, tab.url);
        break;
      }
      case "record-macro":
        log.warn("use patch overlay to record macros");
        break;
      case "run-macro":
        await handleRunMacro();
        break;
      default:
        log.warn("unknown command", { command });
    }
  } catch (error) {
    log.error("command failed", {
      command,
      error: error instanceof Error ? error.message : String(error),
    });
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
        log.error("message handler failed", {
          type: message.type,
          error: errorMessage,
        });
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
      throw new Error("Use the Patch overlay to record macros.");
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
    case "PATCH_LOG":
      relayLogEntry(message.entry);
      return { ok: true };
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
    log.info("shortcut ignored — url mismatch", { macro: macro.name, url });
    return;
  }

  await runMacro(resolvedTabId, macro);
  log.info("ran macro via shortcut", { macro: macro.name });
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
  log.info("ran macro", { macro: macro.name, url });
}
