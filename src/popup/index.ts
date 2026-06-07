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

const intentInput = requireElement<HTMLInputElement>("intent-input");
const recordBtn = requireElement<HTMLButtonElement>("record-btn");
const runBtn = requireElement<HTMLButtonElement>("run-btn");
const captureBtn = requireElement<HTMLButtonElement>("capture-btn");
const generateBtn = requireElement<HTMLButtonElement>("generate-btn");
const statusEl = requireElement<HTMLParagraphElement>("status");
const captureOutputEl = requireElement<HTMLPreElement>("capture-output");
const optionsLink = requireElement<HTMLAnchorElement>("options-link");

const actionButtons = [recordBtn, runBtn, captureBtn, generateBtn];

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setBusy(disabled: boolean): void {
  for (const button of actionButtons) {
    button.toggleAttribute("disabled", disabled);
  }
  intentInput.toggleAttribute("disabled", disabled);
}

function getIntent(): string {
  return intentInput.value.trim();
}

function requireIntent(): string {
  const intent = getIntent();
  if (!intent) {
    throw new Error("Enter an intent first.");
  }
  return intent;
}

async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

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
      const capture = (
        globalThis as { __patchCaptureDom?: () => DomElement[] }
      ).__patchCaptureDom;
      return capture?.() ?? [];
    },
  });

  return {
    elements: (result?.result ?? []) as DomElement[],
    url: tab.url ?? "",
  };
}

async function handleAction(
  message: BackgroundMessage,
  successMessage: string,
): Promise<void> {
  setBusy(true);

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
    setBusy(false);
  }
}

async function handleCaptureDom(): Promise<void> {
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

async function handleRecordMacro(): Promise<void> {
  setBusy(true);

  try {
    const intent = requireIntent();

    setStatus("Capturing DOM…");
    const { elements, url } = await captureDomOnActiveTab();

    setStatus("Generating macro…");
    const generateResponse = await sendBackgroundMessage({
      type: "GENERATE_MACRO",
      intent,
      elements,
      url,
    });
    if (!generateResponse.ok) {
      throw new Error(generateResponse.error);
    }
    if (!generateResponse.macro) {
      throw new Error("Failed to generate macro.");
    }

    setStatus("Saving macro…");
    const saveResponse = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: generateResponse.macro,
    });
    if (!saveResponse.ok) {
      throw new Error(saveResponse.error);
    }

    setStatus(`Saved macro "${generateResponse.macro.name}"`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to record macro";
    setStatus(errorMessage, true);
    if (errorMessage === "Enter an intent first.") {
      intentInput.focus();
    }
  } finally {
    setBusy(false);
  }
}

async function handleGenerateMacro(): Promise<void> {
  setBusy(true);

  try {
    const intent = requireIntent();

    setStatus("Capturing DOM…");
    const { elements, url } = await captureDomOnActiveTab();

    setStatus("Generating macro…");
    const response = await sendBackgroundMessage({
      type: "GENERATE_MACRO",
      intent,
      elements,
      url,
    });

    if (!response.ok) {
      throw new Error(response.error);
    }

    console.info("[Patch] Generated macro:", response.macro);
    setStatus("Macro generated — see console");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate macro";
    setStatus(errorMessage, true);
    if (errorMessage === "Enter an intent first.") {
      intentInput.focus();
    }
  } finally {
    setBusy(false);
  }
}

recordBtn.addEventListener("click", () => {
  void handleRecordMacro();
});

runBtn.addEventListener("click", () => {
  void handleAction({ type: "RUN_MACRO" }, "Run macro dispatched");
});

captureBtn.addEventListener("click", () => {
  void handleCaptureDom();
});

generateBtn.addEventListener("click", () => {
  void handleGenerateMacro();
});

optionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  void chrome.runtime.openOptionsPage();
});
