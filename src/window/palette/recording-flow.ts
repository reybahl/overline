import type { PendingRecord } from "@/shared/types/pending-record";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import {
  clearPendingRecord,
  getPendingRecord,
} from "@/shared/clients/storage";
import { RECORDING_CANCELLED_MESSAGE } from "@/background/recording/recording-session";
import {
  getActiveTab,
  getRestrictedPageMessage,
  isInjectableUrl,
} from "@/shared/tab";
import {
  intentInput,
  palettePanelEl,
  searchInput,
} from "@/window/palette/elements";
import { refreshMacros } from "@/window/palette/macros";
import { getPendingMacro, hideReview, showReview } from "@/window/palette/review";
import { paletteState } from "@/window/palette/state";
import {
  setBusy,
  setIntentInputVisible,
  setRecordingUi,
  setStatus,
} from "@/window/palette/ui";

function stopPendingRecordPoll(): void {
  if (paletteState.pendingRecordPoll !== undefined) {
    window.clearInterval(paletteState.pendingRecordPoll);
    paletteState.pendingRecordPoll = undefined;
  }
}

function startPendingRecordPoll(): void {
  stopPendingRecordPoll();
  paletteState.pendingRecordPoll = window.setInterval(() => {
    void syncPendingRecord();
  }, 1000);
}

export async function syncPendingRecord(): Promise<void> {
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

export async function handleCreateMacroFromSearch(): Promise<void> {
  const query = searchInput.value.trim();
  if (!query) {
    return;
  }

  await handleRecordMacro(query);
}

export async function handleRecordMacro(intentOverride?: string): Promise<void> {
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
        if (!response.ok) {
          stopPendingRecordPoll();
          setBusy(false);
          setStatus(response.error ?? "Recording failed.", true);
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

export async function handleConfirmSave(): Promise<void> {
  const pendingMacro = getPendingMacro();
  if (!pendingMacro) {
    return;
  }

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

export function handleDiscard(): void {
  hideReview();
  palettePanelEl.hidden = false;
  intentInput.value = "";
  setIntentInputVisible(false);
  void clearPendingRecord().then(() => {
    setStatus("Recording discarded.");
    searchInput.focus();
  });
}

export async function handleCancelRecording(): Promise<void> {
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
    applyPendingRecord(response.pendingRecord);
    setStatus(RECORDING_CANCELLED_MESSAGE);
    searchInput.focus();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel recording";
    setStatus(message, true);
  }
}
