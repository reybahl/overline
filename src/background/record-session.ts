import { getTabUrl } from "@/background/capture";
import { runAgenticRecord } from "@/background/record";
import {
  assertRecordingSessionActive,
  isRecordingCancelledError,
} from "@/background/recording-session";
import { compileMacroScript, inferRunScope } from "@/background/worker";
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

    await assertRecordingSessionActive();

    const endUrl = await getTabUrl(tabId);
    let current = await getPendingRecord();
    if (current?.status === "recording") {
      await savePendingRecord({
        ...current,
        progress: "Compiling generalized script…",
      });
    }

    await assertRecordingSessionActive();

    const script = await compileMacroScript(
      intent,
      startUrl,
      endUrl,
      result.macro.steps,
    );

    await assertRecordingSessionActive();

    current = await getPendingRecord();
    if (current?.status === "recording") {
      await savePendingRecord({
        ...current,
        progress: "Deciding where this macro should run…",
      });
    }

    await assertRecordingSessionActive();

    const macro = await attachRunScope(
      { ...result.macro, script, intent },
      intent,
      startUrl,
      endUrl,
    );

    await assertRecordingSessionActive();

    await savePendingRecord({
      status: "complete",
      intent,
      macro,
      reasoning: result.reasoning,
      completedAt: Date.now(),
    });
  } catch (error) {
    if (isRecordingCancelledError(error)) {
      return;
    }

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
