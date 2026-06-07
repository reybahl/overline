const PAGE_SETTLE_MS = 500;
const TAB_LOAD_TIMEOUT_MS = 8000;

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

export async function settleAfterStep(tabId: number): Promise<void> {
  await waitForTabLoad(tabId);
  await new Promise((resolve) => {
    setTimeout(resolve, PAGE_SETTLE_MS);
  });
}
