import { captureOutputEl } from "@/window/palette/elements";
import { setBusy, setStatus } from "@/window/palette/ui";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";
import type { DomElement } from "@/shared/types/dom";

const DOM_CAPTURE_SCRIPT = "src/content/dom-capture.js";

async function captureDomOnActiveTab(): Promise<{
  elements: DomElement[];
  url: string;
}> {
  const tab = await getActiveTab();
  const tabId = tab.id;
  if (tabId === undefined) {
    throw new Error("No active tab found.");
  }
  if (!isInjectableUrl(tab.url)) {
    throw new Error(getRestrictedPageMessage(tab.url));
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [DOM_CAPTURE_SCRIPT],
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const hooks = (
        globalThis as {
          __olIndexInteractives?: () => DomElement[];
          __olCaptureDom?: () => DomElement[];
        }
      );
      const capture = hooks.__olIndexInteractives ?? hooks.__olCaptureDom;
      return capture?.() ?? [];
    },
  });

  return {
    elements: (result?.result ?? []) as DomElement[],
    url: tab.url ?? "",
  };
}

export async function handleCaptureDom(): Promise<void> {
  if (!captureOutputEl.hidden) {
    captureOutputEl.hidden = true;
    captureOutputEl.textContent = "";
    setStatus("");
    return;
  }

  setBusy(true);
  captureOutputEl.hidden = true;
  captureOutputEl.textContent = "";

  try {
    const { elements } = await captureDomOnActiveTab();
    captureOutputEl.textContent = JSON.stringify(elements, null, 2);
    captureOutputEl.hidden = false;
    setStatus(`Captured ${elements.length} elements`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to capture DOM";
    setStatus(errorMessage, true);
  } finally {
    setBusy(false);
  }
}
