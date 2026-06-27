import { getTabUrl } from "@/background/capture";
import { createLogger } from "@/shared/logger";
import {
  IN_PAGE_SETTLE_MS,
  MATCH_POLL_INTERVAL_MS,
  PAGE_SETTLE_MS,
  TAB_LOAD_TIMEOUT_MS,
  URL_CHANGE_DETECT_MS,
} from "@/shared/timing";

export {
  IN_PAGE_SETTLE_MS,
  PAGE_SETTLE_MS,
  STEP_WAIT_FOR_MS,
  TAB_LOAD_TIMEOUT_MS,
} from "@/shared/timing";

const log = createLogger("settle");

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

export async function waitForUrlChangeAfterClick(
  tabId: number,
  urlBeforeClick: string,
  timeoutMs = TAB_LOAD_TIMEOUT_MS,
): Promise<boolean> {
  const navigated = await waitForUrlChange(tabId, urlBeforeClick, timeoutMs);
  if (navigated) {
    log.debug("navigation detected", { tabId, urlBefore: urlBeforeClick });
    await delay(PAGE_SETTLE_MS);
  }
  return navigated;
}

export type SettleOptions = {
  /** When true, briefly poll for URL change (extended wait runs before the next step if needed). */
  expectNavigation?: boolean;
};

export async function settleAfterStep(
  tabId: number,
  urlBeforeStep?: string,
  options?: SettleOptions,
): Promise<void> {
  const expectNavigation = options?.expectNavigation ?? false;

  if (urlBeforeStep && expectNavigation) {
    const navigated = await waitForUrlChange(
      tabId,
      urlBeforeStep,
      URL_CHANGE_DETECT_MS,
    );
    log.debug("after click", { tabId, navigated, urlBefore: urlBeforeStep, expectNavigation: true });
    if (navigated) {
      await delay(PAGE_SETTLE_MS);
      return;
    }
    await delay(IN_PAGE_SETTLE_MS);
    return;
  }

  if (urlBeforeStep) {
    log.debug("after click", { tabId, inPage: true, urlBefore: urlBeforeStep });
  }

  await waitForTabLoad(tabId);
  await delay(IN_PAGE_SETTLE_MS);
}
