import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/ui/ConfirmDialog";
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
    <div className="patch-section">
      <p className="patch-section__title">Shortcut</p>
      <div className="patch-inline-actions">
        {macro.shortcut ? (
          <kbd className="patch-kbd">{formatShortcutForDisplay(macro.shortcut)}</kbd>
        ) : (
          <span className="patch-text-muted">None</span>
        )}
        <button
          type="button"
          className="patch-btn patch-btn--sm"
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
            className="patch-btn patch-btn--sm patch-btn--ghost"
            onClick={() => {
              void clearShortcut();
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

type MacroDetailsEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

function MacroDetailsEditor({ macro, onSaved, onError }: MacroDetailsEditorProps) {
  const [name, setName] = useState(macro.name);
  const [description, setDescription] = useState(macro.description ?? "");
  const [dirty, setDirty] = useState(false);

  async function saveDetails(): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      onError("Name is required.");
      return;
    }

    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: {
        ...macro,
        name: trimmedName,
        description: description.trim() || undefined,
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
    <div className="patch-section">
      <label className="patch-field">
        <span className="patch-label">Name</span>
        <input
          type="text"
          className="patch-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="patch-field">
        <span className="patch-label">Description</span>
        <input
          type="text"
          className="patch-input"
          placeholder={
            macro.intent && !macro.description
              ? macro.intent
              : "What this macro does"
          }
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      {dirty ? (
        <button
          type="button"
          className="patch-btn patch-btn--sm"
          onClick={() => {
            void saveDetails();
          }}
        >
          Save
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
    <div className="patch-section">
      <p className="patch-section__title">Run on</p>
      <label className="patch-field">
        <span className="patch-label">Description</span>
        <input
          type="text"
          className="patch-input"
          placeholder="e.g. Any repository page on this site"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="patch-field">
        <span className="patch-label">URL regex</span>
        <input
          type="text"
          className="patch-input patch-input--mono"
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
          className="patch-btn patch-btn--sm"
          onClick={() => {
            void saveRunScope();
          }}
        >
          Save run scope
        </button>
      ) : macro.runScope ? null : (
        <p className="patch-text-muted">
          No run scope yet. Record a new macro or fill in both fields above.
        </p>
      )}
    </div>
  );
}

type MacroCardProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
  onDelete: () => void;
};

function MacroCard({ macro, onSaved, onError, onDelete }: MacroCardProps) {
  const summaryDescription = macro.description ?? macro.intent;

  return (
    <details className="patch-card">
      <summary className="patch-card__summary">
        <div className="patch-card__summary-main">
          <div className="patch-card__heading">
            <span className="patch-card__title">{macro.name}</span>
            {macro.shortcut ? (
              <kbd className="patch-kbd patch-kbd--compact">
                {formatShortcutForDisplay(macro.shortcut)}
              </kbd>
            ) : null}
          </div>
          {summaryDescription ? (
            <p className="patch-card__meta">{summaryDescription}</p>
          ) : null}
        </div>
      </summary>

      <div className="patch-card__body">
        <MacroDetailsEditor
          key={`${macro.id}-${macro.updatedAt}-details`}
          macro={macro}
          onSaved={onSaved}
          onError={onError}
        />
        <RunScopeEditor
          key={`${macro.id}-${macro.updatedAt}`}
          macro={macro}
          onSaved={onSaved}
          onError={onError}
        />
        <ShortcutEditor macro={macro} onSaved={onSaved} onError={onError} />

        {macro.script ? (
          <details className="patch-disclosure">
            <summary>
              {macro.script.steps.length} compiled script step
              {macro.script.steps.length === 1 ? "" : "s"}
            </summary>
            <ol className="patch-list--stack">
              {macro.script.steps.map((step, index) => (
                <li
                  key={`${macro.id}-script-${index}`}
                  className="patch-code-item"
                >
                  {formatScriptStep(step, index)}
                </li>
              ))}
            </ol>
            <details className="patch-disclosure">
              <summary>Raw script JSON</summary>
              <pre className="patch-code">
                {JSON.stringify(macro.script, null, 2)}
              </pre>
            </details>
          </details>
        ) : null}

        <details className="patch-disclosure">
          <summary>
            {macro.script
              ? `${macro.steps.length} demo ${
                  macro.steps.length === 1 ? "step" : "steps"
                } (reference)`
              : `${macro.steps.length} ${
                  macro.steps.length === 1 ? "step" : "steps"
                }`}
          </summary>
          <ol className="patch-list--stack">
            {macro.steps.map((step, index) => (
              <li key={step.id} className="patch-code-item">
                {formatStep(step, index)}
              </li>
            ))}
          </ol>
        </details>

        <div className="patch-card__footer">
          <button
            type="button"
            className="patch-btn patch-btn--icon patch-btn--danger"
            aria-label={`Delete ${macro.name}`}
            onClick={onDelete}
          >
            <svg
              className="patch-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 4.5h11M6 4.5V3.25A.75.75 0 0 1 6.75 2.5h2.5a.75.75 0 0 1 .75.75V4.5M12.5 4.5v8.25a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V4.5"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6.75 7.25v4M9.25 7.25v4"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </details>
  );
}

export default function App() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [macroPendingDelete, setMacroPendingDelete] = useState<Macro | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const macrosResponse = await sendBackgroundMessage({ type: "GET_MACROS" });

        if (!macrosResponse.ok) {
          throw new Error(macrosResponse.error);
        }

        setMacros(macrosResponse.macros ?? []);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load macros";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function confirmDeleteMacro(): Promise<void> {
    if (!macroPendingDelete) {
      return;
    }

    const macro = macroPendingDelete;
    setMacroPendingDelete(null);

    const response = await sendBackgroundMessage({
      type: "DELETE_MACRO",
      macroId: macro.id,
    });

    if (!response.ok) {
      setShortcutError(response.error);
      return;
    }

    setMacros(response.macros ?? []);
  }

  if (loading) {
    return (
      <main className="patch-page">
        <p className="patch-text-muted">Loading macros…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="patch-page">
        <p className="patch-status patch-status--error">{error}</p>
      </main>
    );
  }

  return (
    <>
      <main className="patch-page patch-page--options">
      <header className="patch-page-header">
        <h1 className="patch-header__title patch-header__title--lg">Patch</h1>
        <p className="patch-header__subtitle">
          Saved macros, shortcuts, and run scope.
        </p>
      </header>

      {shortcutError ? (
        <p className="patch-alert patch-alert--error">{shortcutError}</p>
      ) : null}

      {macros.length === 0 ? (
        <p className="patch-text-muted">
          No macros yet. Open Patch on a page and choose Record.
        </p>
      ) : (
        <ul className="patch-stack patch-stack--loose">
          {macros.map((macro) => (
            <li key={macro.id}>
              <MacroCard
                macro={macro}
                onSaved={setMacros}
                onError={setShortcutError}
                onDelete={() => {
                  setMacroPendingDelete(macro);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      </main>

      <ConfirmDialog
        open={macroPendingDelete !== null}
        title="Delete macro?"
        message={
          macroPendingDelete
            ? `"${macroPendingDelete.name}" will be permanently removed.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void confirmDeleteMacro();
        }}
        onCancel={() => {
          setMacroPendingDelete(null);
        }}
      />
    </>
  );
}
