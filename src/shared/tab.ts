const INJECTABLE_URL_PATTERN = /^https?:\/\//;

export function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return INJECTABLE_URL_PATTERN.test(url);
}

export function getRestrictedPageMessage(url: string | undefined): string {
  if (!url) {
    return "No active tab found.";
  }

  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return "Patch can't run on Chrome system pages. Open a regular website first.";
  }

  if (url.startsWith("edge://") || url.startsWith("about:")) {
    return "Patch can't run on this browser page. Open a regular website first.";
  }

  if (url.startsWith("file://")) {
    return "Patch can't run on local files unless file access is enabled.";
  }

  return "Patch only works on http:// and https:// pages.";
}

export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  return tab;
}
