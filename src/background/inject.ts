import type { ContentMessage, ContentResponse } from "@/shared/types/messages";

const CONTENT_SCRIPT_PATH = "src/content/index.js";

export async function ensureContentScript(tabId: number): Promise<void> {
  const isReady = await pingContentScript(tabId);
  if (isReady) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_PATH],
  });

  const readyAfterInject = await pingContentScript(tabId);
  if (!readyAfterInject) {
    throw new Error("Failed to start Overline on this tab.");
  }
}

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "PING",
    } satisfies ContentMessage);
    return (response as ContentResponse | undefined)?.ok === true;
  } catch {
    return false;
  }
}

export async function sendContentMessage(
  tabId: number,
  message: ContentMessage,
): Promise<ContentResponse> {
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, message);
  return response as ContentResponse;
}
