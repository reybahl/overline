import { testLlmConnection } from "@/background/llm-test";
import { relayLogEntry } from "@/background/log-relay";
import { macroNeedsParams, validateMacroForSave, validateMacroParamValues } from "@/shared/macro-signature";
import type { MacroParamValues } from "@/shared/macro-signature";
import { runMacro } from "@/background/playback/play";
import { startAgenticRecordSession } from "@/background/recording/record-session";
import { cancelPendingRecordSession } from "@/background/recording/recording-session";
import { createLogger } from "@/shared/logger";
import { macroMatchesUrl } from "@/shared/macro-match";
import { normalizeShortcut } from "@/shared/shortcut";
import { validateRunScopePattern } from "@/shared/run-scope";
import { getLlmSettings, saveLlmSettings } from "@/shared/clients/llm-settings";
import { getMacros, getPendingRecord, saveMacros } from "@/shared/clients/storage";
import {
  LlmSettingsDraftSchema,
  mergeLlmSettingsDraft,
  toPublicLlmSettings,
} from "@/shared/llm";
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
  params?: MacroParamValues,
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

  if (macroNeedsParams(macro) && !params) {
    throw new Error(`"${macro.name}" requires inputs — run it from the palette.`);
  }

  await runMacro(resolvedTabId, macro, { params });
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

    const signatureError = validateMacroForSave(message.macro);
    if (signatureError) {
      throw new Error(signatureError);
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

    if (macroNeedsParams(macro)) {
      if (!message.params) {
        throw new Error(`"${macro.name}" requires inputs.`);
      }
      const validationError = validateMacroParamValues(
        macro.signature!.params,
        message.params,
      );
      if (validationError) {
        throw new Error(validationError);
      }
    }

    await runMacro(message.tabId, macro, { params: message.params });
    return { ok: true as const };
  },

  DEV_LOG: async (message, _context) => {
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

  GET_LLM_SETTINGS: async (_message, _context) => {
    const settings = await getLlmSettings();
    return {
      ok: true as const,
      configured: settings !== null,
      settings: settings ? toPublicLlmSettings(settings) : null,
    };
  },

  SAVE_LLM_SETTINGS: async (message, _context) => {
    const parsedDraft = LlmSettingsDraftSchema.parse(message.draft);
    const existing = await getLlmSettings();
    const settings = mergeLlmSettingsDraft(parsedDraft, existing);
    await saveLlmSettings(settings);
    return {
      ok: true as const,
      settings: toPublicLlmSettings(settings),
    };
  },

  TEST_LLM_SETTINGS: async (message, _context) => {
    const existing = await getLlmSettings();
    const draft = message.draft
      ? LlmSettingsDraftSchema.parse(message.draft)
      : null;

    if (!draft && !existing) {
      throw new Error("Configure AI settings before testing the connection.");
    }

    const settings = draft
      ? mergeLlmSettingsDraft(draft, existing)
      : existing!;

    await testLlmConnection(settings);
    return { ok: true as const };
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
    case "DEV_LOG":
      return backgroundHandlers.DEV_LOG(message, context);
    case "AGENTIC_RECORD":
      return backgroundHandlers.AGENTIC_RECORD(message, context);
    case "CANCEL_PENDING_RECORD":
      return backgroundHandlers.CANCEL_PENDING_RECORD(message, context);
    case "GET_LLM_SETTINGS":
      return backgroundHandlers.GET_LLM_SETTINGS(message, context);
    case "SAVE_LLM_SETTINGS":
      return backgroundHandlers.SAVE_LLM_SETTINGS(message, context);
    case "TEST_LLM_SETTINGS":
      return backgroundHandlers.TEST_LLM_SETTINGS(message, context);
    default: {
      const _exhaustive: never = message;
      throw new Error(`Unknown message type "${String(_exhaustive)}"`);
    }
  }
}
