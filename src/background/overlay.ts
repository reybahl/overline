import type { ContentMessage, ContentResponse } from "@/shared/types/messages";
import {
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";

const OVERLAY_HOST_SCRIPT = "src/content/overlay-host.js";

async function sendOverlayMessage(
  tabId: number,
  message: ContentMessage,
): Promise<ContentResponse> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as ContentResponse;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [OVERLAY_HOST_SCRIPT],
    });

    const response = await chrome.tabs.sendMessage(tabId, message);
    return response as ContentResponse;
  }
}

export async function toggleOverlay(tabId: number, url?: string): Promise<void> {
  if (!isInjectableUrl(url)) {
    throw new Error(getRestrictedPageMessage(url));
  }

  const response = await sendOverlayMessage(tabId, {
    type: "TOGGLE_OVERLAY",
  });

  if (!response.ok) {
    throw new Error(response.error ?? "Failed to open Overline.");
  }
}

export async function closeOverlay(tabId: number): Promise<void> {
  try {
    await sendOverlayMessage(tabId, { type: "CLOSE_OVERLAY" });
  } catch {
    // Overlay host may not be loaded, or overlay already closed.
  }
}

export async function openOverlayForMacro(
  tabId: number,
  macroId: string,
  url?: string,
): Promise<void> {
  if (!isInjectableUrl(url)) {
    throw new Error(getRestrictedPageMessage(url));
  }

  const response = await sendOverlayMessage(tabId, {
    type: "OPEN_OVERLAY_RUN_MACRO",
    macroId,
  });

  if (!response.ok) {
    throw new Error(response.error ?? "Failed to open Overline.");
  }
}
