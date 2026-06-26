import { executeSteps } from "@/content/executor";
import { executeScript, resolveClickPoint } from "@/content/script-executor";
import type { ContentMessage, ContentResponse } from "@/shared/types/messages";
import { MacroScriptSchema } from "@/shared/types/script";

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
      if (
        message.type === "TOGGLE_PATCH_OVERLAY" ||
        message.type === "CLOSE_PATCH_OVERLAY"
      ) {
        return false;
      }

      switch (message.type) {
        case "PING":
          sendResponse({ ok: true });
          return false;
        case "EXECUTE_STEPS":
          void executeSteps(message.steps)
            .then((matches) => {
              sendResponse({ ok: true, matches });
            })
            .catch((error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : "Failed to run macro";
              sendResponse({ ok: false, error: errorMessage });
            });
          return true;
        case "EXECUTE_SCRIPT": {
          const script = MacroScriptSchema.parse({
            version: 1,
            steps: message.steps,
          });
          void executeScript(script)
            .then(() => {
              sendResponse({ ok: true });
            })
            .catch((error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : "Failed to run macro";
              sendResponse({ ok: false, error: errorMessage });
            });
          return true;
        }
        case "RESOLVE_CLICK_TARGET":
          void resolveClickPoint(message.match, message.index)
            .then((point) => {
              sendResponse({ ok: true, point });
            })
            .catch((error: unknown) => {
              const errorMessage =
                error instanceof Error ? error.message : "Failed to locate element";
              sendResponse({ ok: false, error: errorMessage });
            });
          return true;
        case "RUN_MACRO":
          void (async () => {
            if (message.macro.script) {
              await executeScript(message.macro.script);
              return;
            }
            await executeSteps(message.macro.steps);
          })()
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
