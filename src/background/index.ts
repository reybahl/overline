import { runMacroSteps } from "@/background/play";
import { runAgenticRecord } from "@/background/record";
import { generateMacro } from "@/background/worker";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";
import { findMacroForUrl } from "@/shared/macro-match";
import { getMacros, getSettings, saveMacros, saveSettings } from "@/shared/storage";
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
  switch (message.type) {
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
      if (index >= 0) {
        macros[index] = message.macro;
      } else {
        macros.push(message.macro);
      }
      await saveMacros(macros);

      const settings = await getSettings();
      await saveSettings({
        ...settings,
        currentMacroId: message.macro.id,
      });

      return { ok: true, macros };
    }
    case "DELETE_MACRO": {
      const macros = (await getMacros()).filter(
        (macro) => macro.id !== message.macroId,
      );
      await saveMacros(macros);
      return { ok: true, macros };
    }
    case "RECORD_MACRO":
      throw new Error("Use the popup to record macros.");
    case "RUN_MACRO":
      await handleRunMacro();
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
    case "AGENTIC_RECORD": {
      const result = await runAgenticRecord(
        message.intent,
        message.tabId,
        message.startUrl,
      );
      console.info("[Patch] Agentic record complete:", result.macro);
      return {
        ok: true,
        macro: result.macro,
        reasoning: result.reasoning,
      };
    }
    default: {
      const _exhaustive: never = message;
      return { ok: false, error: `Unhandled message: ${String(_exhaustive)}` };
    }
  }
}

async function requireInjectableActiveTab(): Promise<chrome.tabs.Tab> {
  const tab = await getActiveTab();
  if (!isInjectableUrl(tab.url)) {
    throw new Error(getRestrictedPageMessage(tab.url));
  }
  return tab;
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
