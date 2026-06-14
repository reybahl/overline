import {
  clearPendingRecord,
  getPendingRecord,
  savePendingRecord,
} from "@/shared/storage";

export class RecordingCancelledError extends Error {
  constructor() {
    super("Recording cancelled.");
    this.name = "RecordingCancelledError";
  }
}

export async function isRecordingSessionActive(): Promise<boolean> {
  const pending = await getPendingRecord();
  return pending?.status === "recording";
}

export async function assertRecordingSessionActive(): Promise<void> {
  if (!(await isRecordingSessionActive())) {
    throw new RecordingCancelledError();
  }
}

export async function cancelPendingRecordSession(): Promise<void> {
  const pending = await getPendingRecord();
  if (pending?.status === "recording") {
    await savePendingRecord({
      status: "error",
      intent: pending.intent,
      error: "Recording cancelled.",
      completedAt: Date.now(),
    });
    return;
  }

  await clearPendingRecord();
}

export function isRecordingCancelledError(error: unknown): boolean {
  return error instanceof RecordingCancelledError;
}
