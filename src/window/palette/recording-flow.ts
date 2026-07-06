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
  palettePanelEl,
  searchInput,
} from "@/window/palette/elements";
import { refreshMacros } from "@/window/palette/macros";
import { getPendingMacro, hideReview, showReview } from "@/window/palette/review";
import { paletteState } from "@/window/palette/state";
import {
  setBusy,
  setRecordingUi,
  setStatus,
} from "@/window/palette/ui";

const RECORDING_STATUS_MESSAGE =
  "Recording… you can close Overline while it keeps working.";

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

function clearRecordingSession(): void {
  paletteState.recordingSessionStartedAt = undefined;
}

function isExpectingRecordingSession(): boolean {
  return paletteState.recordingSessionStartedAt !== undefined;
}

function isStalePendingError(record: Extract<PendingRecord, { status: "error" }>): boolean {
  const sessionStartedAt = paletteState.recordingSessionStartedAt;
  return sessionStartedAt !== undefined && record.completedAt < sessionStartedAt;
}

function showRecordingInProgress(): void {
  setBusy(true);
  setRecordingUi(true);
  palettePanelEl.hidden = true;
  setStatus(RECORDING_STATUS_MESSAGE);
}

export async function syncPendingRecord(): Promise<void> {
  try {
    applyPendingRecord(await getPendingRecord());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load recording";
    setStatus(message, true);
    clearRecordingSession();
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
    if (isExpectingRecordingSession()) {
      showRecordingInProgress();
      return;
    }

    stopPendingRecordPoll();
    setRecordingUi(false);
    palettePanelEl.hidden = false;
    return;
  }

  switch (record.status) {
    case "recording":
      showRecordingInProgress();
      setStatus(record.progress ?? RECORDING_STATUS_MESSAGE);
      startPendingRecordPoll();
      return;
    case "complete":
      clearRecordingSession();
      stopPendingRecordPoll();
      setBusy(false);
      setRecordingUi(false);
      palettePanelEl.hidden = true;
      showReview(record.macro, record.reasoning);
      setStatus("Review the recorded steps below.");
      return;
    case "error":
      if (isStalePendingError(record)) {
        showRecordingInProgress();
        return;
      }

      clearRecordingSession();
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

export async function handleRecordMacro(intent: string): Promise<void> {
  hideReview();

  const trimmedIntent = intent.trim();
  if (!trimmedIntent) {
    return;
  }

  setBusy(true);

  try {
    const pending = await getPendingRecord();
    if (pending?.status === "recording") {
      showRecordingInProgress();
      startPendingRecordPoll();
      return;
    }

    const tab = await getActiveTab();
    const tabId = tab.id;
    const startUrl = tab.url;

    if (tabId === undefined) {
      throw new Error("No active tab found.");
    }
    if (!startUrl || !isInjectableUrl(startUrl)) {
      throw new Error(getRestrictedPageMessage(startUrl));
    }

    paletteState.recordingSessionStartedAt = Date.now();
    await clearPendingRecord();

    showRecordingInProgress();
    startPendingRecordPoll();

    void sendBackgroundMessage({
      type: "AGENTIC_RECORD",
      intent: trimmedIntent,
      tabId,
      startUrl,
    })
      .then(async (response) => {
        if (!response.ok) {
          clearRecordingSession();
          stopPendingRecordPoll();
          setBusy(false);
          setRecordingUi(false);
          palettePanelEl.hidden = false;
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

        clearRecordingSession();
        stopPendingRecordPoll();
        setBusy(false);
        setRecordingUi(false);
        palettePanelEl.hidden = false;
        const errorMessage =
          error instanceof Error ? error.message : "Failed to record macro";
        setStatus(errorMessage, true);
      });
  } catch (error) {
    clearRecordingSession();
    stopPendingRecordPoll();
    const errorMessage =
      error instanceof Error ? error.message : "Failed to record macro";
    setStatus(errorMessage, true);
    setBusy(false);
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
  clearRecordingSession();
  void clearPendingRecord().then(() => {
    setStatus("Recording discarded.");
    searchInput.focus();
  });
}

export async function handleCancelRecording(): Promise<void> {
  stopPendingRecordPoll();
  clearRecordingSession();
  setBusy(false);
  setRecordingUi(false);
  palettePanelEl.hidden = false;

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
