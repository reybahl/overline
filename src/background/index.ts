import { sendContentMessage } from "@/background/inject";
import { generateMacroSuggestion } from "@/background/llm";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";
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
        await handleRecordMacro();
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
      await handleRecordMacro();
      return { ok: true };
    case "RUN_MACRO":
      await handleRunMacro();
      return { ok: true };
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

async function handleRecordMacro(): Promise<void> {
  const tab = await requireInjectableActiveTab();
  const response = await sendContentMessage(tab.id!, { type: "START_RECORDING" });
  if (!response.ok) {
    throw new Error(response.error);
  }
  console.info("[Patch] Record macro command dispatched");
}

async function handleRunMacro(): Promise<void> {
  const tab = await requireInjectableActiveTab();
  const settings = await getSettings();
  const macros = await getMacros();
  const currentMacro = macros.find((macro) => macro.id === settings.currentMacroId);

  if (!currentMacro) {
    const suggestion = await generateMacroSuggestion(
      "No macro is selected. Describe what Patch should do next.",
    );
    console.info("[Patch] LLM placeholder response:", suggestion);
    return;
  }

  const response = await sendContentMessage(tab.id!, {
    type: "RUN_MACRO",
    macro: currentMacro,
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
  console.info("[Patch] Run macro command dispatched");
}
