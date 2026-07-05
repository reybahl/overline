import { MacroSchema, type Macro } from "@/shared/types/macro";
import {
  PendingRecordSchema,
  type PendingRecord,
} from "@/shared/types/pending-record";
import { MacroScriptSchema, ScriptStepSchema } from "@/shared/types/script";

function migrateScriptRaw(
  script: unknown,
): { script: unknown | undefined; changed: boolean } {
  if (!script || typeof script !== "object") {
    return { script, changed: false };
  }

  const raw = script as { version?: unknown; steps?: unknown };
  if (!Array.isArray(raw.steps)) {
    return { script: undefined, changed: true };
  }

  const keptSteps: unknown[] = [];
  let changed = false;

  for (const step of raw.steps) {
    const parsed = ScriptStepSchema.safeParse(step);
    if (parsed.success) {
      keptSteps.push(parsed.data);
      continue;
    }

    changed = true;
  }

  if (!changed) {
    return { script, changed: false };
  }

  if (keptSteps.length === 0) {
    return { script: undefined, changed: true };
  }

  const migrated = MacroScriptSchema.parse({
    version: 1,
    steps: keptSteps,
  });

  return { script: migrated, changed: true };
}

export function migrateMacroRaw(
  raw: unknown,
): { macro: Macro | null; changed: boolean } {
  if (!raw || typeof raw !== "object") {
    return { macro: null, changed: false };
  }

  const copy = { ...(raw as Record<string, unknown>) };
  let changed = false;

  if ("script" in copy) {
    const { script, changed: scriptChanged } = migrateScriptRaw(copy.script);
    if (scriptChanged) {
      changed = true;
      if (script === undefined) {
        delete copy.script;
      } else {
        copy.script = script;
      }
    }
  }

  const parsed = MacroSchema.safeParse(copy);
  if (!parsed.success) {
    return { macro: null, changed: true };
  }

  return { macro: parsed.data, changed };
}

export function migrateMacrosFromStorage(raw: unknown): {
  macros: Macro[];
  changed: boolean;
} {
  if (!Array.isArray(raw)) {
    return { macros: [], changed: raw !== undefined && raw !== null };
  }

  const macros: Macro[] = [];
  let changed = false;

  for (const item of raw) {
    const { macro, changed: itemChanged } = migrateMacroRaw(item);
    if (itemChanged) {
      changed = true;
    }
    if (macro) {
      macros.push(macro);
    }
  }

  if (macros.length !== raw.length) {
    changed = true;
  }

  return { macros, changed };
}

export function migratePendingRecordRaw(raw: unknown): {
  record: PendingRecord | null;
  changed: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return { record: null, changed: false };
  }

  const copy = { ...(raw as Record<string, unknown>) };
  let changed = false;

  if (copy.status === "complete" && copy.macro) {
    const { macro, changed: macroChanged } = migrateMacroRaw(copy.macro);
    if (macroChanged) {
      changed = true;
    }
    if (macro) {
      copy.macro = macro;
    } else {
      return {
        record: PendingRecordSchema.parse({
          status: "error",
          intent:
            typeof copy.intent === "string" ? copy.intent : "Unknown intent",
          error: "Saved recording used an outdated script format. Record again.",
          completedAt: Date.now(),
        }),
        changed: true,
      };
    }
  }

  const parsed = PendingRecordSchema.safeParse(copy);
  if (!parsed.success) {
    return { record: null, changed: true };
  }

  return { record: parsed.data, changed };
}
