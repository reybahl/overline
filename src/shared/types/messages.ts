import type { LogEntry } from "@/shared/types/log";
import type { Macro } from "@/shared/types/macro";
import type { ElementMatch, ScriptStep } from "@/shared/types/script";
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
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "GET_MACROS" }
  | { type: "SAVE_MACRO"; macro: Macro }
  | { type: "DELETE_MACRO"; macroId: string }
  | { type: "PATCH_LOG"; entry: LogEntry };

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
  | {
      type: "RESOLVE_CLICK_TARGET";
      match: import("@/shared/types/script").ElementMatch;
      index?: number;
    }
  | { type: "RUN_MACRO"; macro: Macro }
  | { type: "PING" }
  | { type: "TOGGLE_PATCH_OVERLAY" }
  | { type: "CLOSE_PATCH_OVERLAY" };

/** Viewport-relative center of an element, in CSS pixels. */
export type ContentPoint = { x: number; y: number };

export type ContentResponse =
  | {
      ok: true;
      point?: ContentPoint;
      /** Per-step element matches from EXECUTE_STEPS; null for non-element steps. */
      matches?: (ElementMatch | null)[];
    }
  | { ok: false; error: string };
