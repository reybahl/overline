import type { ContentMessage, ContentResponse } from "@/shared/types/messages";
import type { Macro } from "@/shared/types/macro";

let isRecording = false;

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
      case "START_RECORDING":
        isRecording = true;
        console.info("[Patch] Recording started (placeholder)");
        sendResponse({ ok: true });
        return false;
      case "STOP_RECORDING":
        isRecording = false;
        console.info("[Patch] Recording stopped (placeholder)");
        sendResponse({ ok: true });
        return false;
      case "RUN_MACRO":
        runMacroPlaceholder(message.macro);
        sendResponse({ ok: true });
        return false;
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

function runMacroPlaceholder(macro: Macro): void {
  console.info(
    `[Patch] Running macro "${macro.name}" with ${macro.steps.length} steps (placeholder)`,
    { isRecording },
  );
}
