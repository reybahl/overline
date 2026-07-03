import { relayLogEntry } from "@/background/log-relay";
import { runMacro } from "@/background/playback/play";
import { startAgenticRecordSession } from "@/background/recording/record-session";
import { cancelPendingRecordSession } from "@/background/recording/recording-session";
import { createLogger } from "@/shared/logger";
import { macroMatchesUrl } from "@/shared/macro-match";
import { normalizeShortcut } from "@/shared/shortcut";
import { validateRunScopePattern } from "@/shared/run-scope";
import { getMacros, getPendingRecord, saveMacros } from "@/shared/clients/storage";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";
import type {
  BackgroundHandlerContext,
  BackgroundHandlers,
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";

const log = createLogger("bg");

async function requireInjectableActiveTab(): Promise<chrome.tabs.Tab> {
  const tab = await getActiveTab();
  if (!isInjectableUrl(tab.url)) {
    throw new Error(getRestrictedPageMessage(tab.url));
  }
  return tab;
}

async function runMacroById(
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

export const backgroundHandlers = {
  GET_MACROS: async (_message, _context) => ({
    ok: true as const,
    macros: await getMacros(),
  }),

  SAVE_MACRO: async (message, _context) => {
    const macros = await getMacros();
    const index = macros.findIndex((macro) => macro.id === message.macro.id);

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

    return { ok: true as const, macros };
  },

  DELETE_MACRO: async (message, _context) => {
    const macros = (await getMacros()).filter(
      (macro) => macro.id !== message.macroId,
    );
    await saveMacros(macros);

    return { ok: true as const, macros };
  },

  RUN_MACRO_BY_ID: async (message, { sender }) => {
    await runMacroById(message.macroId, sender.tab?.id);
    return { ok: true as const };
  },

  EXECUTE_MACRO: async (message, _context) => {
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
    return { ok: true as const };
  },

  PATCH_LOG: async (message, _context) => {
    relayLogEntry(message.entry);
    return { ok: true as const };
  },

  AGENTIC_RECORD: async (message, _context) => {
    await startAgenticRecordSession(
      message.intent,
      message.tabId,
      message.startUrl,
    );
    return { ok: true as const };
  },

  CANCEL_PENDING_RECORD: async (_message, _context) => {
    await cancelPendingRecordSession();
    return {
      ok: true as const,
      pendingRecord: await getPendingRecord(),
    };
  },
} satisfies BackgroundHandlers;

export async function handleBackgroundMessage(
  message: BackgroundMessage,
  context: BackgroundHandlerContext,
): Promise<BackgroundResponse> {
  switch (message.type) {
    case "GET_MACROS":
      return backgroundHandlers.GET_MACROS(message, context);
    case "SAVE_MACRO":
      return backgroundHandlers.SAVE_MACRO(message, context);
    case "DELETE_MACRO":
      return backgroundHandlers.DELETE_MACRO(message, context);
    case "RUN_MACRO_BY_ID":
      return backgroundHandlers.RUN_MACRO_BY_ID(message, context);
    case "EXECUTE_MACRO":
      return backgroundHandlers.EXECUTE_MACRO(message, context);
    case "PATCH_LOG":
      return backgroundHandlers.PATCH_LOG(message, context);
    case "AGENTIC_RECORD":
      return backgroundHandlers.AGENTIC_RECORD(message, context);
    case "CANCEL_PENDING_RECORD":
      return backgroundHandlers.CANCEL_PENDING_RECORD(message, context);
    default: {
      const _exhaustive: never = message;
      throw new Error(`Unknown message type "${String(_exhaustive)}"`);
    }
  }
}
