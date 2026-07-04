import { sendContentMessage } from "@/background/inject";
import type {
  DomElement,
  ListInteractivesOptions,
  ListInteractivesResult,
  SearchInteractivesOptions,
} from "@/shared/types/dom";

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

export async function searchInteractivesInTab(
  tabId: number,
  query: string,
  options?: SearchInteractivesOptions,
): Promise<DomElement[]> {
  const response = await sendContentMessage(tabId, {
    type: "SEARCH_INTERACTIVES",
    query,
    options,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.elements ?? [];
}

export async function listInteractivesInTab(
  tabId: number,
  options?: ListInteractivesOptions,
): Promise<ListInteractivesResult> {
  const response = await sendContentMessage(tabId, {
    type: "LIST_INTERACTIVES",
    options,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return {
    elements: response.elements ?? [],
    total: response.total ?? 0,
    offset: response.offset ?? options?.offset ?? 0,
    limit: response.limit ?? options?.limit ?? 20,
  };
}

export async function getTabUrl(tabId: number): Promise<string> {
  const tab = await chrome.tabs.get(tabId);
  return tab.url ?? "";
}
