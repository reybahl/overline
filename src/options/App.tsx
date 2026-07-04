import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/options/ConfirmDialog";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { saveMacros } from "@/shared/clients/storage";
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

        onSaved(response.macros);
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

    onSaved(response.macros);
  }

  return (
    <div className="ui-section">
      <p className="ui-section__title">Shortcut</p>
      <div className="ui-inline-actions">
        {macro.shortcut ? (
          <kbd className="ui-kbd">{formatShortcutForDisplay(macro.shortcut)}</kbd>
        ) : (
          <span className="ui-text-muted">None</span>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--sm"
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
            className="ui-btn ui-btn--sm ui-btn--ghost"
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
    onSaved(response.macros);
    setDirty(false);
  }

  return (
    <div className="ui-section">
      <label className="ui-field">
        <span className="ui-label">Name</span>
        <input
          type="text"
          className="ui-input"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="ui-field">
        <span className="ui-label">Description</span>
        <input
          type="text"
          className="ui-input"
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
          className="ui-btn ui-btn--sm"
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
    onSaved(response.macros);
    setDirty(false);
  }

  return (
    <div className="ui-section">
      <p className="ui-section__title">Run on</p>
      <label className="ui-field">
        <span className="ui-label">Description</span>
        <input
          type="text"
          className="ui-input"
          placeholder="e.g. Any repository page on this site"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label className="ui-field">
        <span className="ui-label">URL regex</span>
        <input
          type="text"
          className="ui-input ui-input--mono"
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
          className="ui-btn ui-btn--sm"
          onClick={() => {
            void saveRunScope();
          }}
        >
          Save run scope
        </button>
      ) : macro.runScope ? null : (
        <p className="ui-text-muted">
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
    <details className="ui-card">
      <summary className="ui-card__summary">
        <div className="ui-card__summary-main">
          <div className="ui-card__heading">
            <span className="ui-card__title">{macro.name}</span>
            {macro.shortcut ? (
              <kbd className="ui-kbd ui-kbd--compact">
                {formatShortcutForDisplay(macro.shortcut)}
              </kbd>
            ) : null}
          </div>
          {summaryDescription ? (
            <p className="ui-card__meta">{summaryDescription}</p>
          ) : null}
        </div>
      </summary>

      <div className="ui-card__body">
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
          <details className="ui-disclosure">
            <summary>
              {macro.script.steps.length} script step
              {macro.script.steps.length === 1 ? "" : "s"}
            </summary>
            <ol className="ui-list--stack">
              {macro.script.steps.map((step, index) => (
                <li
                  key={`${macro.id}-script-${index}`}
                  className="ui-code-item"
                >
                  {formatScriptStep(step, index)}
                </li>
              ))}
            </ol>
            <details className="ui-disclosure">
              <summary>Raw script JSON</summary>
              <pre className="ui-code">
                {JSON.stringify(macro.script, null, 2)}
              </pre>
            </details>
          </details>
        ) : (
          <p className="ui-text-muted">No compiled script — re-record this macro.</p>
        )}

        <details className="ui-disclosure">
          <summary>
            {macro.steps.length} demo {macro.steps.length === 1 ? "step" : "steps"}{" "}
            (recording reference)
          </summary>
          <ol className="ui-list--stack">
            {macro.steps.map((step, index) => (
              <li key={step.id} className="ui-code-item">
                {formatStep(step, index)}
              </li>
            ))}
          </ol>
        </details>

        <div className="ui-card__footer">
          <button
            type="button"
            className="ui-btn ui-btn--icon ui-btn--danger"
            aria-label={`Delete ${macro.name}`}
            onClick={onDelete}
          >
            <svg
              className="ui-icon"
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
  const [clearAllPending, setClearAllPending] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const macrosResponse = await sendBackgroundMessage({ type: "GET_MACROS" });

        if (!macrosResponse.ok) {
          throw new Error(macrosResponse.error);
        }

        setMacros(macrosResponse.macros);
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

    setMacros(response.macros);
  }

  async function confirmClearAll(): Promise<void> {
    setClearAllPending(false);

    try {
      await saveMacros([]);
      setMacros([]);
      setShortcutError(null);
    } catch (clearError) {
      const message =
        clearError instanceof Error ? clearError.message : "Failed to clear macros";
      setShortcutError(message);
    }
  }

  if (loading) {
    return (
      <main className="ui-page">
        <p className="ui-text-muted">Loading macros…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="ui-page">
        <p className="ui-status ui-status--error">{error}</p>
      </main>
    );
  }

  return (
    <>
      <main className="ui-page ui-page--options">
      <header className="ui-page-header">
        <div className="ui-options-header">
          <div>
            <h1 className="ui-header__title ui-header__title--lg">Overline</h1>
            <p className="ui-header__subtitle">
              Saved macros, shortcuts, and run scope.
            </p>
          </div>
          {macros.length > 0 ? (
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--destructive"
              onClick={() => {
                setClearAllPending(true);
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>
      </header>

      {shortcutError ? (
        <p className="ui-alert ui-alert--error">{shortcutError}</p>
      ) : null}

      {macros.length === 0 ? (
        <p className="ui-text-muted">
          No macros yet. Open Overline on a page and choose Record.
        </p>
      ) : (
        <ul className="ui-stack ui-stack--loose">
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
        open={clearAllPending}
        title="Clear all macros?"
        message={`All ${macros.length} saved macro${
          macros.length === 1 ? "" : "s"
        } will be permanently removed.`}
        confirmLabel="Clear all"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void confirmClearAll();
        }}
        onCancel={() => {
          setClearAllPending(false);
        }}
      />

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
