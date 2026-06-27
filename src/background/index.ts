import { togglePatchOverlay } from "@/background/overlay";
import { handleBackgroundMessage } from "@/background/message-handlers";
import { relayLogEntry } from "@/background/log-relay";
import { bindLogRelay, createLogger } from "@/shared/logger";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";
import { getActiveTab } from "@/shared/tab";

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
    void handleBackgroundMessage(message, { sender })
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
