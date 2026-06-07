import type { DomElement } from "@/content/dom-capture";
import type { Macro, MacroStep } from "@/shared/types/macro";
import type { Settings } from "@/shared/types/settings";

export type BackgroundMessage =
  | { type: "RECORD_MACRO" }
  | { type: "RUN_MACRO" }
  | { type: "GENERATE_MACRO"; intent: string; elements: DomElement[]; url: string }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "GET_MACROS" }
  | { type: "SAVE_MACRO"; macro: Macro }
  | { type: "DELETE_MACRO"; macroId: string };

export type BackgroundResponse =
  | { ok: true; settings?: Settings; macros?: Macro[]; macro?: Macro }
  | { ok: false; error: string };

export type ContentMessage =
  | { type: "EXECUTE_STEPS"; steps: MacroStep[] }
  | { type: "RUN_MACRO"; macro: Macro }
  | { type: "PING" };

export type ContentResponse =
  | { ok: true }
  | { ok: false; error: string };
