import { useEffect, useState } from "react";

import type { BackgroundMessage, BackgroundResponse } from "@/shared/types/messages";
import type { Macro, MacroStep, RunScope } from "@/shared/types/macro";
import { formatScriptStep } from "@/shared/script-format";
import {
  eventToShortcut,
  formatShortcutForDisplay,
} from "@/shared/shortcut";
import { validateRunScopePattern } from "@/shared/run-scope";

function formatStep(step: MacroStep, index: number): string {
  const parts = [`${index + 1}. ${step.type}`];
  if (step.selector) parts.push(step.selector);
  if (step.value) {
    if (step.type === "confirm") {
      parts.push(`confirm: "${step.value}"`);
    } else if (step.type === "waitFor") {
      parts.push(`timeout: ${step.value}ms`);
    } else {
      parts.push(`"${step.value}"`);
    }
  }
  return parts.join(" · ");
}

async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

type ShortcutEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

function ShortcutEditor({ macro, onSaved, onError }: ShortcutEditorProps) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();

      if (event.key === "Escape") {
        setListening(false);
        return;
      }

      const shortcut = eventToShortcut(event);
      if (!shortcut) {
        return;
      }

      void (async () => {
        const response = await sendBackgroundMessage({
          type: "SAVE_MACRO",
          macro: {
            ...macro,
            shortcut,
            updatedAt: Date.now(),
          },
        });

        if (!response.ok) {
          onError(response.error);
          setListening(false);
          return;
        }

        onSaved(response.macros ?? []);
        setListening(false);
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [listening, macro, onError, onSaved]);

  async function clearShortcut(): Promise<void> {
    const { shortcut: _removed, ...macroWithoutShortcut } = macro;
    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: {
        ...macroWithoutShortcut,
        updatedAt: Date.now(),
      },
    });

    if (!response.ok) {
      onError(response.error);
      return;
    }

    onSaved(response.macros ?? []);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Shortcut
      </span>
      {macro.shortcut ? (
        <kbd className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200">
          {formatShortcutForDisplay(macro.shortcut)}
        </kbd>
      ) : (
        <span className="text-xs text-slate-500">None</span>
      )}
      <button
        type="button"
        className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
        onClick={() => {
          onError(null);
          setListening(true);
        }}
      >
        {listening ? "Press keys… (Esc to cancel)" : macro.shortcut ? "Change" : "Set shortcut"}
      </button>
      {macro.shortcut ? (
        <button
          type="button"
          className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
          onClick={() => {
            void clearShortcut();
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

type RunScopeEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

function RunScopeEditor({ macro, onSaved, onError }: RunScopeEditorProps) {
  const [description, setDescription] = useState(macro.runScope?.description ?? "");
  const [pattern, setPattern] = useState(macro.runScope?.pattern ?? "");
  const [dirty, setDirty] = useState(false);

  async function saveRunScope(): Promise<void> {
    const patternError = validateRunScopePattern(pattern);
    if (patternError) {
      onError(`Invalid regex: ${patternError}`);
      return;
    }

    if (!description.trim()) {
      onError("Description is required.");
      return;
    }

    const runScope: RunScope = {
      description: description.trim(),
      pattern: pattern.trim(),
    };

    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: {
        ...macro,
        runScope,
        updatedAt: Date.now(),
      },
    });

    if (!response.ok) {
      onError(response.error);
      return;
    }

    onError(null);
    onSaved(response.macros ?? []);
    setDirty(false);
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Run on
      </p>
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">Description</span>
        <input
          type="text"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          placeholder="e.g. Any repository page on this site"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">URL regex</span>
        <input
          type="text"
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200"
          placeholder="^https://…"
          value={pattern}
          onChange={(event) => {
            setPattern(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      {dirty ? (
        <button
          type="button"
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
          onClick={() => {
            void saveRunScope();
          }}
        >
          Save run scope
        </button>
      ) : macro.runScope ? null : (
        <p className="text-xs text-slate-500">
          No run scope yet. Record a new macro or fill in both fields above.
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [activeMacroId, setActiveMacroId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [macrosResponse, settingsResponse] = await Promise.all([
          sendBackgroundMessage({ type: "GET_MACROS" }),
          sendBackgroundMessage({ type: "GET_SETTINGS" }),
        ]);

        if (!macrosResponse.ok) {
          throw new Error(macrosResponse.error);
        }
        if (!settingsResponse.ok) {
          throw new Error(settingsResponse.error);
        }

        setMacros(macrosResponse.macros ?? []);
        setActiveMacroId(settingsResponse.settings?.currentMacroId ?? null);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load macros";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function deleteMacro(macro: Macro): Promise<void> {
    if (!window.confirm(`Delete "${macro.name}"?`)) {
      return;
    }

    const response = await sendBackgroundMessage({
      type: "DELETE_MACRO",
      macroId: macro.id,
    });

    if (!response.ok) {
      setShortcutError(response.error);
      return;
    }

    setMacros(response.macros ?? []);
    if (activeMacroId === macro.id) {
      setActiveMacroId(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-slate-400">Loading macros…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Patch</h1>
        <p className="text-slate-400">
          Manage saved macros. Configure where each macro runs and assign
          keyboard shortcuts.
        </p>
      </header>

      {shortcutError ? (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {shortcutError}
        </p>
      ) : null}

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-medium">Macros</h2>
        {macros.length === 0 ? (
          <p className="text-sm text-slate-400">
            No macros yet. Click the Patch icon and choose{" "}
            <span className="font-medium text-slate-300">Record macro</span>.
          </p>
        ) : (
          <ul className="space-y-2">
            {macros.map((macro) => (
              <li
                key={macro.id}
                className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{macro.name}</p>
                    {macro.id === activeMacroId ? (
                      <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-medium text-indigo-300">
                        Active
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-slate-500 transition hover:text-red-400"
                    onClick={() => {
                      void deleteMacro(macro);
                    }}
                  >
                    Delete
                  </button>
                </div>
                {macro.intent ? (
                  <p className="mt-1 text-sm text-slate-400">
                    Intent: <span className="text-slate-300">"{macro.intent}"</span>
                  </p>
                ) : null}
                {macro.description ? (
                  <p className="mt-1 text-sm text-slate-400">
                    {macro.description}
                  </p>
                ) : null}
                <RunScopeEditor
                  key={`${macro.id}-${macro.updatedAt}`}
                  macro={macro}
                  onSaved={setMacros}
                  onError={setShortcutError}
                />
                <ShortcutEditor
                  macro={macro}
                  onSaved={setMacros}
                  onError={setShortcutError}
                />
                {macro.script ? (
                  <details className="mt-2" open>
                    <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300">
                      {macro.script.steps.length} compiled script step
                      {macro.script.steps.length === 1 ? "" : "s"}
                    </summary>
                    <ol className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                      {macro.script.steps.map((step, index) => (
                        <li
                          key={`${macro.id}-script-${index}`}
                          className="rounded-md bg-indigo-950/40 px-3 py-2 font-mono text-xs text-indigo-100"
                        >
                          {formatScriptStep(step, index)}
                        </li>
                      ))}
                    </ol>
                    <details className="mt-3 border-t border-slate-800 pt-3">
                      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
                        Raw script JSON
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-300">
                        {JSON.stringify(macro.script, null, 2)}
                      </pre>
                    </details>
                  </details>
                ) : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300">
                    {macro.script
                      ? `${macro.steps.length} demo ${
                          macro.steps.length === 1 ? "step" : "steps"
                        } (reference)`
                      : `${macro.steps.length} ${
                          macro.steps.length === 1 ? "step" : "steps"
                        }`}
                  </summary>
                  <ol className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                    {macro.steps.map((step, index) => (
                      <li
                        key={step.id}
                        className="rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-slate-300"
                      >
                        {formatStep(step, index)}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
