import {
  clearPendingRecord,
  getPendingRecord,
} from "@/shared/storage";

export const RECORDING_CANCELLED_MESSAGE = "Recording cancelled.";

export class RecordingCancelledError extends Error {
  constructor() {
    super(RECORDING_CANCELLED_MESSAGE);
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
  await clearPendingRecord();
}

export function isRecordingCancelledError(error: unknown): boolean {
  return error instanceof RecordingCancelledError;
}
