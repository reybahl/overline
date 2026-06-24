import "@/ui/index.css";

import type { DomElement } from "@/content/dom-capture";
import type { Macro, MacroStep } from "@/shared/types/macro";
import type { PendingRecord } from "@/shared/types/pending-record";
import type {
  BackgroundMessage,
  BackgroundResponse,
} from "@/shared/types/messages";
import { formatScriptStep } from "@/shared/script-format";
import { getMacrosForUrl, macroMatchesUrl } from "@/shared/macro-match";
import { RECORDING_CANCELLED_MESSAGE } from "@/background/recording-session";
import { clearPendingRecord, getPendingRecord } from "@/shared/storage";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";
import { formatShortcutForDisplay } from "@/shared/shortcut";
import {
  PATCH_PANEL_CLOSE_MESSAGE,
  PATCH_PANEL_RESIZE_MESSAGE,
} from "@/ui/tokens";
import { mountLucideIcon } from "@/ui/mount-icon";
import { Braces, Plus, Settings } from "lucide";

const DOM_CAPTURE_SCRIPT = "src/content/dom-capture.js";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Patch markup is missing #${id}`);
  }
  return element as T;
}

const searchInput = requireElement<HTMLInputElement>("search-input");
const intentInput = requireElement<HTMLInputElement>("intent-input");
const macroListEl = requireElement<HTMLUListElement>("macro-list");
const macroEmptyEl = requireElement<HTMLParagraphElement>("macro-empty");
const palettePanelEl = requireElement<HTMLElement>("palette-panel");
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

const actionButtons = [generateBtn, captureBtn];

mountLucideIcon(captureBtn, Braces);
mountLucideIcon(optionsLink, Settings);
mountLucideIcon(generateBtn, Plus);

let savedMacros: Macro[] = [];
let pageMacros: Macro[] = [];
let filteredMacros: Macro[] = [];
let selectedIndex = 0;
let currentTabUrl = "";
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
    palettePanelEl.hidden = false;
    return;
  }

  switch (record.status) {
    case "recording":
      setBusy(true);
      setRecordingUi(true);
      palettePanelEl.hidden = true;
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
      palettePanelEl.hidden = true;
      showReview(record.macro, record.reasoning);
      setStatus("Review the recorded steps below.");
      return;
    case "error":
      stopPendingRecordPoll();
      setBusy(false);
      setRecordingUi(false);
      palettePanelEl.hidden = false;
      hideReview();
      if (record.error === RECORDING_CANCELLED_MESSAGE) {
        void clearPendingRecord();
        return;
      }
      setStatus(record.error, true);
      return;
    default: {
      const _exhaustive: never = record;
      throw new Error(`Unhandled pending record: ${String(_exhaustive)}`);
    }
  }
}

function setIntentInputVisible(visible: boolean): void {
  intentInput.hidden = !visible;
}

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("patch-status--error", isError);
}

function setBusy(disabled: boolean): void {
  for (const button of actionButtons) {
    button.toggleAttribute("disabled", disabled);
  }
  searchInput.toggleAttribute("disabled", disabled);
  intentInput.toggleAttribute("disabled", disabled);
  confirmSaveBtn.toggleAttribute("disabled", disabled);
  discardBtn.toggleAttribute("disabled", disabled);

  for (const button of macroListEl.querySelectorAll("button")) {
    button.toggleAttribute("disabled", disabled);
  }
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

function getMacroDescription(macro: Macro): string | undefined {
  return macro.description ?? macro.intent;
}

function filterMacros(macros: Macro[], query: string): Macro[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return macros;
  }

  return macros.filter((macro) => {
    const haystack = [macro.name, macro.description, macro.intent]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

function getTrimmedSearchQuery(): string {
  return searchInput.value.trim();
}

function hasCreateMacroOption(): boolean {
  return getTrimmedSearchQuery().length > 0;
}

function getSelectableItemCount(): number {
  return filteredMacros.length + (hasCreateMacroOption() ? 1 : 0);
}

function isCreateMacroOptionSelected(): boolean {
  return hasCreateMacroOption() && selectedIndex === filteredMacros.length;
}

function scrollSelectedIntoView(): void {
  const activeItem = macroListEl.querySelector(".patch-palette__item--active");
  activeItem?.scrollIntoView({ block: "nearest" });
}

function renderCreateMacroItem(index: number): HTMLLIElement {
  const query = getTrimmedSearchQuery();
  const item = document.createElement("li");
  item.className = "patch-palette__item patch-palette__item--create";
  if (index === selectedIndex) {
    item.classList.add("patch-palette__item--active");
  }
  item.setAttribute("role", "option");
  item.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "patch-palette__item-btn";
  button.addEventListener("click", () => {
    void handleCreateMacroFromSearch();
  });

  mountLucideIcon(button, Plus);

  const main = document.createElement("div");
  main.className = "patch-palette__item-main";

  const title = document.createElement("span");
  title.className = "patch-palette__item-title";
  title.textContent = `Create new macro "${query}"`;
  main.appendChild(title);

  button.appendChild(main);
  item.appendChild(button);
  return item;
}

function renderMacroList(highlightMacroId?: string): void {
  filteredMacros = filterMacros(pageMacros, searchInput.value);
  macroListEl.replaceChildren();
  const showCreateOption = hasCreateMacroOption();

  if (highlightMacroId) {
    const highlightIndex = filteredMacros.findIndex(
      (macro) => macro.id === highlightMacroId,
    );
    selectedIndex = highlightIndex >= 0 ? highlightIndex : 0;
  }

  const itemCount = getSelectableItemCount();
  if (itemCount === 0) {
    macroEmptyEl.hidden = false;
    macroEmptyEl.textContent =
      pageMacros.length === 0
        ? currentTabUrl
          ? "No macros for this page"
          : "No macros saved"
        : "No matching macros";
    selectedIndex = 0;
    return;
  }

  macroEmptyEl.hidden = true;

  if (selectedIndex >= itemCount) {
    selectedIndex = itemCount - 1;
  }
  if (selectedIndex < 0) {
    selectedIndex = 0;
  }

  for (const [index, macro] of filteredMacros.entries()) {
    const item = document.createElement("li");
    item.className = "patch-palette__item";
    if (index === selectedIndex) {
      item.classList.add("patch-palette__item--active");
    }
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", index === selectedIndex ? "true" : "false");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "patch-palette__item-btn";
    button.addEventListener("click", () => {
      void handleRunMacro(macro);
    });

    const main = document.createElement("div");
    main.className = "patch-palette__item-main";

    const title = document.createElement("span");
    title.className = "patch-palette__item-title";
    title.textContent = macro.name;
    main.appendChild(title);

    const description = getMacroDescription(macro);
    if (description) {
      const subtitle = document.createElement("span");
      subtitle.className = "patch-palette__item-desc";
      subtitle.textContent = description;
      main.appendChild(subtitle);
    }

    button.appendChild(main);

    if (macro.shortcut) {
      const shortcut = document.createElement("kbd");
      shortcut.className = "patch-kbd patch-kbd--compact";
      shortcut.textContent = formatShortcutForDisplay(macro.shortcut);
      button.appendChild(shortcut);
    }

    item.appendChild(button);
    macroListEl.appendChild(item);
  }

  if (showCreateOption) {
    macroListEl.appendChild(renderCreateMacroItem(filteredMacros.length));
  }
}

async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

async function refreshMacros(preferredMacroId?: string): Promise<void> {
  const tab = await getActiveTab();
  currentTabUrl = tab.url ?? "";

  const macrosResponse = await sendBackgroundMessage({ type: "GET_MACROS" });

  if (!macrosResponse.ok) {
    throw new Error(macrosResponse.error);
  }

  savedMacros = macrosResponse.macros ?? [];
  pageMacros = currentTabUrl
    ? getMacrosForUrl(savedMacros, currentTabUrl)
    : [];

  renderMacroList(preferredMacroId);
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

async function handleCreateMacroFromSearch(): Promise<void> {
  const query = getTrimmedSearchQuery();
  if (!query) {
    return;
  }

  await handleRecordMacro(query);
}

async function handleRecordMacro(intentOverride?: string): Promise<void> {
  hideReview();

  let intent: string;

  if (intentOverride !== undefined) {
    intent = intentOverride.trim();
    if (!intent) {
      return;
    }
  } else {
    const wasIntentHidden = intentInput.hidden;
    setIntentInputVisible(true);

    intent = intentInput.value.trim();
    if (!intent) {
      intentInput.focus();
      if (wasIntentHidden) {
        setStatus("");
        return;
      }
      setStatus("Enter an intent first.", true);
      return;
    }
  }

  intentInput.value = intent;
  setIntentInputVisible(false);
  setBusy(true);

  try {
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
    setIntentInputVisible(false);
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
    palettePanelEl.hidden = false;
    intentInput.value = "";
    setIntentInputVisible(false);
    await clearPendingRecord();
    await refreshMacros(macroId);
    setStatus(`Saved macro "${macroName}"`);
    searchInput.focus();
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
  palettePanelEl.hidden = false;
  intentInput.value = "";
  setIntentInputVisible(false);
  void clearPendingRecord().then(() => {
    setStatus("Recording discarded.");
    searchInput.focus();
  });
}

async function handleCancelRecording(): Promise<void> {
  stopPendingRecordPoll();
  setBusy(false);
  setRecordingUi(false);
  palettePanelEl.hidden = false;
  intentInput.value = "";
  setIntentInputVisible(false);

  try {
    const response = await sendBackgroundMessage({
      type: "CANCEL_PENDING_RECORD",
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
    applyPendingRecord(response.pendingRecord ?? null);
    setStatus(RECORDING_CANCELLED_MESSAGE);
    searchInput.focus();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel recording";
    setStatus(message, true);
  }
}

async function handleRunMacro(macro?: Macro): Promise<void> {
  if (!macro && isCreateMacroOptionSelected()) {
    await handleCreateMacroFromSearch();
    return;
  }

  const target = macro ?? filteredMacros[selectedIndex];
  if (!target) {
    setStatus("No macro selected.", true);
    return;
  }

  setBusy(true);

  try {
    const tab = await getActiveTab();
    const tabId = tab.id;
    const url = tab.url;

    if (tabId === undefined) {
      throw new Error("No active tab found.");
    }
    if (!url || !isInjectableUrl(url)) {
      throw new Error(getRestrictedPageMessage(url));
    }
    if (!macroMatchesUrl(target, url)) {
      throw new Error(`"${target.name}" does not run on this page.`);
    }

    setStatus(`Running "${target.name}"…`);

    const response = await sendBackgroundMessage({
      type: "EXECUTE_MACRO",
      tabId,
      macroId: target.id,
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Failed to run macro.");
    }

    setStatus(`Ran macro "${target.name}"`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to run macro";
    setStatus(errorMessage, true);
  } finally {
    setBusy(false);
  }
}

searchInput.addEventListener("input", () => {
  selectedIndex = 0;
  renderMacroList();
});

searchInput.addEventListener("keydown", (event) => {
  const itemCount = getSelectableItemCount();

  if (event.key === "ArrowDown") {
    if (itemCount === 0) {
      return;
    }
    event.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, itemCount - 1);
    renderMacroList();
    scrollSelectedIntoView();
    return;
  }

  if (event.key === "ArrowUp") {
    if (itemCount === 0) {
      return;
    }
    event.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    renderMacroList();
    scrollSelectedIntoView();
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void handleRunMacro();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  event.preventDefault();
  closePalette();
});

generateBtn.addEventListener("click", () => {
  void handleRecordMacro();
});

intentInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void handleRecordMacro();
  }
});

captureBtn.addEventListener("click", () => {
  void handleCaptureDom();
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

function closePalette(): void {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage({ type: PATCH_PANEL_CLOSE_MESSAGE }, "*");
}

function reportPanelHeight(): void {
  if (window.parent === window) {
    return;
  }

  const height = Math.ceil(document.documentElement.offsetHeight);
  window.parent.postMessage(
    { type: PATCH_PANEL_RESIZE_MESSAGE, height },
    "*",
  );
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

void refreshMacros()
  .then(() => syncPendingRecord())
  .then(() => {
    searchInput.focus();
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Failed to load macros";
    setStatus(message, true);
  });

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if ("patch:macros" in changes) {
    void refreshMacros().catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to refresh macros";
      setStatus(message, true);
    });
  }

  if ("patch:pendingRecord" in changes) {
    void syncPendingRecord();
  }
});
