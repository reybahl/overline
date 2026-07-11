import { toast } from "sonner";

/** Where macro settings is hosted — modal toasts are suppressed (iframe-clipped). */
export type SettingsSurface = "modal" | "page";

export function settingsToast(
  surface: SettingsSurface,
  type: "success" | "error" | "message",
  message: string,
): void {
  if (surface === "modal") {
    return;
  }
  toast[type](message);
}
