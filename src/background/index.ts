import { handleBackgroundMessage } from "@/background/message-handlers";
import { relayLogEntry } from "@/background/log-relay";
import { toggleOverlay } from "@/background/overlay";
import { bindLogRelay, createLogger } from "@/shared/logger";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";

const log = createLogger("bg");

bindLogRelay(relayLogEntry);

chrome.runtime.onInstalled.addListener(() => {
  log.info("extension installed");
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) {
    return;
  }

  void toggleOverlay(tab.id, tab.url).catch((error: unknown) => {
    log.error("failed to open overlay", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
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
