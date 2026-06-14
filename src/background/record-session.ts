import { getTabUrl } from "@/background/capture";
import { runAgenticRecord } from "@/background/record";
import { inferRunScope } from "@/background/worker";
import {
  clearPendingRecord,
  getPendingRecord,
  savePendingRecord,
} from "@/shared/storage";
import type { Macro } from "@/shared/types/macro";

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

    const endUrl = await getTabUrl(tabId);
    const current = await getPendingRecord();
    if (current?.status === "recording") {
      await savePendingRecord({
        ...current,
        progress: "Deciding where this macro should run…",
      });
    }

    const macro = await attachRunScope(
      result.macro,
      intent,
      startUrl,
      endUrl,
    );

    await savePendingRecord({
      status: "complete",
      intent,
      macro,
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

async function attachRunScope(
  macro: Macro,
  intent: string,
  startUrl: string,
  endUrl: string,
): Promise<Macro> {
  const runScope = await inferRunScope(intent, startUrl, endUrl, macro.steps);
  return { ...macro, runScope };
}
