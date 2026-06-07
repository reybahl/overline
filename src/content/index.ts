import { executeSteps } from "@/content/executor";
import type { ContentMessage, ContentResponse } from "@/shared/types/messages";

declare global {
  interface Window {
    __patchContentScriptLoaded?: boolean;
  }
}

function initializeContentScript(): void {
  if (window.__patchContentScriptLoaded) return;
  window.__patchContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener(
    (
      message: ContentMessage,
      _sender,
      sendResponse: (response: ContentResponse) => void,
    ) => {
      switch (message.type) {
        case "PING":
          sendResponse({ ok: true });
          return false;
        case "EXECUTE_STEPS":
          void executeSteps(message.steps)
            .then(() => {
              sendResponse({ ok: true });
            })
            .catch((error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : "Failed to run macro";
              sendResponse({ ok: false, error: errorMessage });
            });
          return true;
        case "RUN_MACRO":
          void executeSteps(message.macro.steps)
            .then(() => {
              sendResponse({ ok: true });
            })
            .catch((error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : "Failed to run macro";
              sendResponse({ ok: false, error: errorMessage });
            });
          return true;
        default: {
          const _exhaustive: never = message;
          sendResponse({
            ok: false,
            error: `Unhandled content message: ${String(_exhaustive)}`,
          });
          return false;
        }
      }
    },
  );
}

initializeContentScript();
