import type { DomElement } from "@/content/dom-capture";
import type { BackgroundMessage, BackgroundResponse } from "@/shared/types/messages";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";

const DOM_CAPTURE_SCRIPT = "src/content/dom-capture.js";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Popup markup is missing #${id}`);
  }
  return element as T;
}

const recordBtn = requireElement<HTMLButtonElement>("record-btn");
const runBtn = requireElement<HTMLButtonElement>("run-btn");
const captureBtn = requireElement<HTMLButtonElement>("capture-btn");
const statusEl = requireElement<HTMLParagraphElement>("status");
const captureOutputEl = requireElement<HTMLPreElement>("capture-output");
const optionsLink = requireElement<HTMLAnchorElement>("options-link");

const actionButtons = [recordBtn, runBtn, captureBtn];

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setButtonsDisabled(disabled: boolean): void {
  for (const button of actionButtons) {
    button.toggleAttribute("disabled", disabled);
  }
}

async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

async function handleAction(
  message: BackgroundMessage,
  successMessage: string,
): Promise<void> {
  setButtonsDisabled(true);

  try {
    const response = await sendBackgroundMessage(message);
    if (!response.ok) {
      throw new Error(response.error);
    }
    setStatus(successMessage);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Something went wrong";
    setStatus(errorMessage, true);
  } finally {
    setButtonsDisabled(false);
  }
}

async function handleCaptureDom(): Promise<void> {
  setButtonsDisabled(true);
  captureOutputEl.hidden = true;
  captureOutputEl.textContent = "";

  try {
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
        const capture = (
          globalThis as { __patchCaptureDom?: () => DomElement[] }
        ).__patchCaptureDom;
        return capture?.() ?? [];
      },
    });

    const elements = (result?.result ?? []) as DomElement[];
    captureOutputEl.textContent = JSON.stringify(elements, null, 2);
    captureOutputEl.hidden = false;
    setStatus(`Captured ${elements.length} elements`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to capture DOM";
    setStatus(errorMessage, true);
  } finally {
    setButtonsDisabled(false);
  }
}

recordBtn.addEventListener("click", () => {
  void handleAction({ type: "RECORD_MACRO" }, "Recording started on this tab");
});

runBtn.addEventListener("click", () => {
  void handleAction({ type: "RUN_MACRO" }, "Run macro dispatched");
});

captureBtn.addEventListener("click", () => {
  void handleCaptureDom();
});

optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  void chrome.runtime.openOptionsPage();
});
