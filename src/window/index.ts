import type { DomElement } from "@/content/dom-capture";
import type { Macro, MacroStep } from "@/shared/types/macro";
import type { PendingRecord } from "@/shared/types/pending-record";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";
import { formatScriptStep } from "@/shared/script-format";
import { getMacrosForUrl, macroMatchesUrl } from "@/shared/macro-match";
import { clearPendingRecord, getPendingRecord } from "@/shared/storage";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";

const DOM_CAPTURE_SCRIPT = "src/content/dom-capture.js";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Patch markup is missing #${id}`);
  }
  return element as T;
}

const intentInput = requireElement<HTMLInputElement>("intent-input");
const macroSelect = requireElement<HTMLSelectElement>("macro-select");
const recordBtn = requireElement<HTMLButtonElement>("record-btn");
const runBtn = requireElement<HTMLButtonElement>("run-btn");
const captureBtn = requireElement<HTMLButtonElement>("capture-btn");
const generateBtn = requireElement<HTMLButtonElement>("generate-btn");
const statusEl = requireElement<HTMLParagraphElement>("status");
const captureOutputEl = requireElement<HTMLPreElement>("capture-output");
const reviewPanelEl = requireElement<HTMLElement>("review-panel");
const reviewSummaryEl = requireElement<HTMLParagraphElement>("review-summary");
const reviewStepsEl = requireElement<HTMLOListElement>("review-steps");
const reviewScriptJsonEl = requireElement<HTMLPreElement>("review-script-json");
const confirmSaveBtn = requireElement<HTMLButtonElement>("confirm-save-btn");
const discardBtn = requireElement<HTMLButtonElement>("discard-btn");
const cancelRecordBtn = requireElement<HTMLButtonElement>("cancel-record-btn");
const optionsLink = requireElement<HTMLButtonElement>("options-link");

const actionButtons = [recordBtn, runBtn, captureBtn, generateBtn];

let savedMacros: Macro[] = [];
let pendingMacro: Macro | null = null;
let pendingRecordPoll: number | undefined;

function stopPendingRecordPoll(): void {
  if (pendingRecordPoll !== undefined) {
    window.clearInterval(pendingRecordPoll);
    pendingRecordPoll = undefined;
  }
}

function startPendingRecordPoll(): void {
  stopPendingRecordPoll();
  pendingRecordPoll = window.setInterval(() => {
    void syncPendingRecord();
  }, 1000);
}

async function syncPendingRecord(): Promise<void> {
  try {
    applyPendingRecord(await getPendingRecord());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load recording";
    setStatus(message, true);
    setBusy(false);
  }
}

function isRecordingChannelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("message port closed") ||
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  );
}

function applyPendingRecord(record: PendingRecord | null): void {
  if (!record) {
    stopPendingRecordPoll();
    setRecordingUi(false);
    return;
  }

  switch (record.status) {
    case "recording":
      setBusy(true);
      setRecordingUi(true);
      setStatus(
        record.progress ??
          "Recording… you can close Patch while it keeps working.",
      );
      startPendingRecordPoll();
      return;
    case "complete":
      stopPendingRecordPoll();
      setBusy(false);
      setRecordingUi(false);
      showReview(record.macro, record.reasoning);
      setStatus("Review the recorded steps below.");
      return;
    case "error":
      stopPendingRecordPoll();
      setBusy(false);
      setRecordingUi(false);
      hideReview();
      setStatus(record.error, true);
      return;
    default: {
      const _exhaustive: never = record;
      throw new Error(`Unhandled pending record: ${String(_exhaustive)}`);
    }
  }
}

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function setBusy(disabled: boolean): void {
  for (const button of actionButtons) {
    button.toggleAttribute("disabled", disabled);
  }
  intentInput.toggleAttribute("disabled", disabled);
  macroSelect.toggleAttribute("disabled", disabled);
  confirmSaveBtn.toggleAttribute("disabled", disabled);
  discardBtn.toggleAttribute("disabled", disabled);
}

function setRecordingUi(isRecording: boolean): void {
  cancelRecordBtn.hidden = !isRecording;
}

function formatStep(step: MacroStep, index: number): string {
  const parts = [`${index + 1}. ${step.type}`];
  if (step.selector) parts.push(step.selector);
  if (step.value) parts.push(`"${step.value}"`);
  return parts.join(" · ");
}

function hideReview(): void {
  pendingMacro = null;
  reviewPanelEl.hidden = true;
  reviewSummaryEl.textContent = "";
  reviewStepsEl.replaceChildren();
  reviewScriptJsonEl.hidden = true;
  reviewScriptJsonEl.textContent = "";
}

function showReview(macro: Macro, reasoning: string[] = []): void {
  pendingMacro = macro;
  const scopeSummary = macro.runScope
    ? ` · Runs on: ${macro.runScope.description}`
    : "";
  const scriptSummary = macro.script
    ? ` · ${macro.script.steps.length} compiled step${
        macro.script.steps.length === 1 ? "" : "s"
      }`
    : "";
  reviewSummaryEl.textContent = `"${macro.name}"${scriptSummary}${scopeSummary}${
    reasoning.length > 0 ? ` · ${reasoning[reasoning.length - 1]}` : ""
  }`;

  reviewStepsEl.replaceChildren();

  if (macro.intent) {
    const intentItem = document.createElement("li");
    intentItem.textContent = `Intent: "${macro.intent}"`;
    reviewStepsEl.appendChild(intentItem);
  }

  if (macro.script) {
    const scriptLabel = document.createElement("li");
    scriptLabel.textContent = "Compiled script (runs on play):";
    reviewStepsEl.appendChild(scriptLabel);

    reviewStepsEl.append(
      ...macro.script.steps.map((step, index) => {
        const item = document.createElement("li");
        item.textContent = formatScriptStep(step, index);
        return item;
      }),
    );
  }

  if (macro.script) {
    reviewScriptJsonEl.textContent = JSON.stringify(macro.script, null, 2);
    reviewScriptJsonEl.hidden = false;
  }

  if (macro.steps.length > 0) {
    const demoLabel = document.createElement("li");
    demoLabel.textContent = "Demo path (reference):";
    reviewStepsEl.appendChild(demoLabel);

    reviewStepsEl.append(
      ...macro.steps.map((step, index) => {
        const item = document.createElement("li");
        item.textContent = formatStep(step, index);
        return item;
      }),
    );
  }

  reviewPanelEl.hidden = false;
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

function getSelectedMacro(): Macro | null {
  const macroId = macroSelect.value;
  if (!macroId) return null;
  return savedMacros.find((macro) => macro.id === macroId) ?? null;
}

async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

async function refreshMacroSelect(preferredMacroId?: string): Promise<void> {
  const tab = await getActiveTab();
  const url = tab.url ?? "";

  const [macrosResponse, settingsResponse] = await Promise.all([
    sendBackgroundMessage({ type: "GET_MACROS" }),
    sendBackgroundMessage({ type: "GET_SETTINGS" }),
  ]);

  if (!macrosResponse.ok) {
    throw new Error(macrosResponse.error);
  }

  savedMacros = macrosResponse.macros ?? [];
  const options = url ? getMacrosForUrl(savedMacros, url) : [];

  macroSelect.replaceChildren();

  if (options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = url
      ? "No macros for this page"
      : "No macros saved";
    macroSelect.appendChild(option);
    runBtn.toggleAttribute("disabled", true);
    return;
  }

  runBtn.toggleAttribute("disabled", false);

  for (const macro of options) {
    const option = document.createElement("option");
    option.value = macro.id;
    option.textContent = `${macro.name}${
      macro.script
        ? ` · ${macro.script.steps.length} script step${
            macro.script.steps.length === 1 ? "" : "s"
          }`
        : ` (${macro.steps.length} steps)`
    }`;
    macroSelect.appendChild(option);
  }

  const preferredId =
    preferredMacroId ??
    (settingsResponse.ok
      ? settingsResponse.settings?.currentMacroId ?? undefined
      : undefined);

  if (preferredId && options.some((macro) => macro.id === preferredId)) {
    macroSelect.value = preferredId;
  }
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
  hideReview();
  setBusy(true);

  try {
    const intent = requireIntent();
    const tab = await getActiveTab();
    const tabId = tab.id;
    const startUrl = tab.url;

    if (tabId === undefined) {
      throw new Error("No active tab found.");
    }
    if (!startUrl || !isInjectableUrl(startUrl)) {
      throw new Error(getRestrictedPageMessage(startUrl));
    }

    setStatus("Recording… you can close Patch while it keeps working.");
    startPendingRecordPoll();

    void sendBackgroundMessage({
      type: "AGENTIC_RECORD",
      intent,
      tabId,
      startUrl,
    })
      .then(async (response) => {
        if (!response?.ok) {
          stopPendingRecordPoll();
          setBusy(false);
          setStatus(response?.error ?? "Recording failed.", true);
          return;
        }

        await syncPendingRecord();
      })
      .catch(async (error: unknown) => {
        if (isRecordingChannelError(error)) {
          await syncPendingRecord();
          return;
        }

        stopPendingRecordPoll();
        setBusy(false);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to record macro";
        setStatus(errorMessage, true);
      });

    await syncPendingRecord();
  } catch (error) {
    stopPendingRecordPoll();
    const errorMessage =
      error instanceof Error ? error.message : "Failed to record macro";
    setStatus(errorMessage, true);
    setBusy(false);
    if (errorMessage === "Enter an intent first.") {
      intentInput.focus();
    }
  }
}

async function handleConfirmSave(): Promise<void> {
  if (!pendingMacro) return;

  setBusy(true);

  try {
    const saveResponse = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: pendingMacro,
    });
    if (!saveResponse.ok) {
      throw new Error(saveResponse.error);
    }

    const macroId = pendingMacro.id;
    const macroName = pendingMacro.name;
    hideReview();
    await clearPendingRecord();
    await refreshMacroSelect(macroId);
    setStatus(`Saved macro "${macroName}"`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to save macro";
    setStatus(errorMessage, true);
  } finally {
    setBusy(false);
  }
}

function handleDiscard(): void {
  hideReview();
  void clearPendingRecord().then(() => {
    setStatus("Recording discarded.");
  });
}

async function handleCancelRecording(): Promise<void> {
  stopPendingRecordPoll();
  setBusy(false);
  setRecordingUi(false);

  try {
    const response = await sendBackgroundMessage({
      type: "CANCEL_PENDING_RECORD",
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    applyPendingRecord(response.pendingRecord ?? null);
    setStatus("Recording cancelled.");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel recording";
    setStatus(message, true);
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

async function handleRunMacro(): Promise<void> {
  setBusy(true);

  try {
    const macro = getSelectedMacro();
    if (!macro) {
      throw new Error("Select a macro to run.");
    }

    const tab = await getActiveTab();
    const tabId = tab.id;
    const url = tab.url;

    if (tabId === undefined) {
      throw new Error("No active tab found.");
    }
    if (!url || !isInjectableUrl(url)) {
      throw new Error(getRestrictedPageMessage(url));
    }
    if (!macroMatchesUrl(macro, url)) {
      throw new Error(`"${macro.name}" does not run on this page.`);
    }

    setStatus(`Running "${macro.name}"…`);

    const response = await sendBackgroundMessage({
      type: "EXECUTE_MACRO",
      tabId,
      macroId: macro.id,
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Failed to run macro.");
    }

    setStatus(`Ran macro "${macro.name}"`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to run macro";
    setStatus(errorMessage, true);
  } finally {
    setBusy(false);
  }
}

recordBtn.addEventListener("click", () => {
  void handleRecordMacro();
});

runBtn.addEventListener("click", () => {
  void handleRunMacro();
});

captureBtn.addEventListener("click", () => {
  void handleCaptureDom();
});

generateBtn.addEventListener("click", () => {
  void handleGenerateMacro();
});

confirmSaveBtn.addEventListener("click", () => {
  void handleConfirmSave();
});

discardBtn.addEventListener("click", () => {
  handleDiscard();
});

cancelRecordBtn.addEventListener("click", () => {
  void handleCancelRecording();
});

optionsLink.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

function reportPanelHeight(): void {
  if (window.parent === window) {
    return;
  }

  const height = Math.ceil(document.documentElement.offsetHeight);
  window.parent.postMessage({ type: "PATCH_PANEL_RESIZE", height }, "*");
}

function startPanelHeightObserver(): void {
  if (window.parent === window) {
    return;
  }

  const scheduleReport = (): void => {
    requestAnimationFrame(reportPanelHeight);
  };

  scheduleReport();
  window.addEventListener("load", scheduleReport);
  new ResizeObserver(scheduleReport).observe(document.documentElement);
}

startPanelHeightObserver();

void refreshMacroSelect()
  .then(() => syncPendingRecord())
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Failed to load macros";
    setStatus(message, true);
  });

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !("patch:pendingRecord" in changes)) {
    return;
  }

  void syncPendingRecord();
});
