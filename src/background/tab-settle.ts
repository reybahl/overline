import { getTabUrl } from "@/background/capture";
import {
  MATCH_POLL_INTERVAL_MS,
  PAGE_SETTLE_MS,
  TAB_LOAD_TIMEOUT_MS,
} from "@/shared/timing";

export { PAGE_SETTLE_MS, STEP_WAIT_FOR_MS, TAB_LOAD_TIMEOUT_MS } from "@/shared/timing";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForTabLoad(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === "complete") {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, TAB_LOAD_TIMEOUT_MS);

    const listener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (
      updatedTabId,
      changeInfo,
    ) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForUrlChange(
  tabId: number,
  previousUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const url = await getTabUrl(tabId);
    if (url && url !== previousUrl) {
      await waitForTabLoad(tabId);
      return true;
    }
    await delay(MATCH_POLL_INTERVAL_MS);
  }

  return false;
}

export async function settleAfterStep(
  tabId: number,
  urlBeforeStep?: string,
): Promise<void> {
  if (urlBeforeStep) {
    const navigated = await waitForUrlChange(
      tabId,
      urlBeforeStep,
      TAB_LOAD_TIMEOUT_MS,
    );
    if (navigated) {
      await delay(PAGE_SETTLE_MS);
      return;
    }
  }

  await waitForTabLoad(tabId);
  await delay(PAGE_SETTLE_MS);
}
