import { runAgenticRecord } from "@/background/record";
import {
  clearPendingRecord,
  getPendingRecord,
  savePendingRecord,
} from "@/shared/storage";

export async function startAgenticRecordSession(
  intent: string,
  tabId: number,
  startUrl: string,
): Promise<void> {
  const pending = await getPendingRecord();
  if (pending?.status === "recording") {
    throw new Error("A recording is already in progress.");
  }

  await savePendingRecord({
    status: "recording",
    intent,
    tabId,
    startUrl,
    startedAt: Date.now(),
  });

  await finishAgenticRecordSession(intent, tabId, startUrl);
}

async function finishAgenticRecordSession(
  intent: string,
  tabId: number,
  startUrl: string,
): Promise<void> {
  try {
    const result = await runAgenticRecord(
      intent,
      tabId,
      startUrl,
      async (progress) => {
        const current = await getPendingRecord();
        if (current?.status !== "recording") {
          return;
        }

        await savePendingRecord({
          ...current,
          progress,
        });
      },
    );

    await savePendingRecord({
      status: "complete",
      intent,
      macro: result.macro,
      reasoning: result.reasoning,
      completedAt: Date.now(),
    });
  } catch (error) {
    await savePendingRecord({
      status: "error",
      intent,
      error: error instanceof Error ? error.message : "Recording failed",
      completedAt: Date.now(),
    });
  }
}

export async function discardPendingRecordSession(): Promise<void> {
  await clearPendingRecord();
}
