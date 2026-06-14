import type { DomElement } from "@/content/dom-capture";
import type { Macro } from "@/shared/types/macro";
import type { ScriptStep } from "@/shared/types/script";
import type { PendingRecord } from "@/shared/types/pending-record";
import type { Settings } from "@/shared/types/settings";

export type BackgroundMessage =
  | { type: "RECORD_MACRO" }
  | { type: "AGENTIC_RECORD"; intent: string; tabId: number; startUrl: string }
  | { type: "START_AGENTIC_RECORD"; intent: string; tabId: number; startUrl: string }
  | { type: "GET_PENDING_RECORD" }
  | { type: "CLEAR_PENDING_RECORD" }
  | { type: "CANCEL_PENDING_RECORD" }
  | { type: "RUN_MACRO" }
  | { type: "RUN_MACRO_BY_ID"; macroId: string }
  | { type: "EXECUTE_MACRO"; tabId: number; macroId: string }
  | { type: "GENERATE_MACRO"; intent: string; elements: DomElement[]; url: string }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "GET_MACROS" }
  | { type: "SAVE_MACRO"; macro: Macro }
  | { type: "DELETE_MACRO"; macroId: string };

export type BackgroundResponse =
  | {
      ok: true;
      settings?: Settings;
      macros?: Macro[];
      macro?: Macro;
      reasoning?: string[];
      pendingRecord?: PendingRecord | null;
    }
  | { ok: false; error: string };

export type ContentMessage =
  | { type: "EXECUTE_STEPS"; steps: import("@/shared/types/macro").MacroStep[] }
  | { type: "EXECUTE_SCRIPT"; steps: ScriptStep[] }
  | { type: "RUN_MACRO"; macro: Macro }
  | { type: "PING" };

export type ContentResponse =
  | { ok: true }
  | { ok: false; error: string };
