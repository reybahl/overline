import { useState } from "react";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import type { Macro, RunScope } from "@/shared/types/macro";
import { validateRunScopePattern } from "@/shared/run-scope";

type RunScopeEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

export function RunScopeEditor({ macro, onSaved, onError }: RunScopeEditorProps) {
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
