import type { LogEntry } from "@/shared/types/log";
import type { Macro, MacroStep } from "@/shared/types/macro";
import type { ScriptStep, ElementMatch } from "@/shared/types/script";
import type { PendingRecord } from "@/shared/types/pending-record";

export type BackgroundMessage =
  | { type: "AGENTIC_RECORD"; intent: string; tabId: number; startUrl: string }
  | { type: "CANCEL_PENDING_RECORD" }
  | { type: "RUN_MACRO_BY_ID"; macroId: string }
  | { type: "EXECUTE_MACRO"; tabId: number; macroId: string }
  | { type: "GET_MACROS" }
  | { type: "SAVE_MACRO"; macro: Macro }
  | { type: "DELETE_MACRO"; macroId: string }
  | { type: "PATCH_LOG"; entry: LogEntry };

export type BackgroundMessageType = BackgroundMessage["type"];

/** Success payload for each background message, keyed by `type`. */
export type BackgroundSuccessMap = {
  AGENTIC_RECORD: { ok: true };
  CANCEL_PENDING_RECORD: { ok: true; pendingRecord: PendingRecord | null };
  RUN_MACRO_BY_ID: { ok: true };
  EXECUTE_MACRO: { ok: true };
  GET_MACROS: { ok: true; macros: Macro[] };
  SAVE_MACRO: { ok: true; macros: Macro[] };
  DELETE_MACRO: { ok: true; macros: Macro[] };
  PATCH_LOG: { ok: true };
};

export type BackgroundFailure = { ok: false; error: string };

export type BackgroundSuccessFor<T extends BackgroundMessageType> =
  BackgroundSuccessMap[T];

export type BackgroundResponseFor<T extends BackgroundMessageType> =
  | BackgroundSuccessFor<T>
  | BackgroundFailure;

export type BackgroundHandlerContext = {
  sender: chrome.runtime.MessageSender;
};

export type BackgroundHandlerFor<K extends BackgroundMessageType> = (
  message: Extract<BackgroundMessage, { type: K }>,
  context: BackgroundHandlerContext,
) => Promise<BackgroundSuccessFor<K>>;

/** One typed handler per `BackgroundMessage` variant. */
export type BackgroundHandlers = {
  [K in BackgroundMessageType]: BackgroundHandlerFor<K>;
};

/** Union of all valid background replies (Chrome `sendResponse` boundary). */
export type BackgroundResponse = {
  [T in BackgroundMessageType]: BackgroundResponseFor<T>;
}[BackgroundMessageType];

export type ContentMessage =
  | { type: "EXECUTE_STEPS"; steps: MacroStep[] }
  | { type: "EXECUTE_SCRIPT"; steps: ScriptStep[] }
  | {
      type: "RESOLVE_CLICK_TARGET";
      match: ElementMatch;
      index?: number;
    }
  | { type: "PING" }
  | { type: "TOGGLE_PATCH_OVERLAY" }
  | { type: "CLOSE_PATCH_OVERLAY" };

/** Viewport-relative center of an element, in CSS pixels. */
export type ContentPoint = { x: number; y: number };

export type ContentResponse =
  | {
      ok: true;
      point?: ContentPoint;
      matches?: (ElementMatch | null)[];
    }
  | { ok: false; error: string };
