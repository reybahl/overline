import { captureDomInTab, getTabUrl } from "@/background/capture";
import { runAgenticRecord } from "@/background/recording/record";
import {
  assertRecordingSessionActive,
  isRecordingCancelledError,
} from "@/background/recording/recording-session";
import { compileMacroScript, inferRunScope } from "@/background/recording/worker";
import { clearRunId, createLogger, newRunId } from "@/shared/logger";
import {
  getPendingRecord,
  savePendingRecord,
} from "@/shared/clients/storage";
import type { Macro } from "@/shared/types/macro";

const log = createLogger("record");

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
  const run = newRunId();
  log.info("recording started", { run, intent, tabId, startUrl });

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
    log.info("demo complete", {
      run,
      stepCount: result.macro.steps.length,
      endUrl,
    });

    let current = await getPendingRecord();
    if (current?.status === "recording") {
      await savePendingRecord({
        ...current,
        progress: "Compiling generalized script…",
      });
    }

    await assertRecordingSessionActive();

    const referenceElements = await captureDomInTab(tabId);
    const script = await compileMacroScript(
      intent,
      startUrl,
      endUrl,
      result.macro.steps,
      referenceElements,
    );

    log.info("script compiled", { run, scriptSteps: script.steps.length });

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

    log.info("recording complete", { run, macroName: macro.name });
  } catch (error) {
    if (isRecordingCancelledError(error)) {
      log.info("recording cancelled", { run });
      return;
    }

    const message = error instanceof Error ? error.message : "Recording failed";
    log.error("recording failed", { run, error: message });

    await savePendingRecord({
      status: "error",
      intent,
      error: message,
      completedAt: Date.now(),
    });
  } finally {
    clearRunId();
  }
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
