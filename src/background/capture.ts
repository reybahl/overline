import type { DomElement } from "@/content/dom-capture";

const DOM_CAPTURE_SCRIPT = "src/content/dom-capture.js";

export async function captureDomInTab(tabId: number): Promise<DomElement[]> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [DOM_CAPTURE_SCRIPT],
  });

  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const capture = (
        globalThis as { __patchCaptureDom?: () => DomElement[] }
      ).__patchCaptureDom;
      return capture?.() ?? [];
    },
  });

  return (result?.result ?? []) as DomElement[];
}

export async function getTabUrl(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  return tab.url ?? "";
}
