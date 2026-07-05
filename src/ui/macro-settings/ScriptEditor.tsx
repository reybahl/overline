import { useState } from "react";
import { Pencil } from "lucide-react";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { validateMacroScriptSignature } from "@/shared/macro-signature";
import { formatScriptStep } from "@/shared/script-format";
import type { Macro } from "@/shared/types/macro";
import { MacroScriptSchema } from "@/shared/types/script";

type ScriptEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

export function ScriptEditor({ macro, onSaved, onError }: ScriptEditorProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  if (!macro.script) {
    return (
      <p className="ui-text-muted">No compiled script — re-record this macro.</p>
    );
  }

  function startEditing(): void {
    setText(JSON.stringify(macro.script, null, 2));
    setDirty(false);
    setEditing(true);
    onError(null);
  }

  function cancelEditing(): void {
    setEditing(false);
    setDirty(false);
  }

  async function saveScript(): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      onError("Invalid JSON.");
      return;
    }

    const result = MacroScriptSchema.safeParse(parsed);
    if (!result.success) {
      onError(result.error.issues[0]?.message ?? "Invalid script.");
      return;
    }

    const params = macro.signature?.params ?? [];
    const syncError = validateMacroScriptSignature(result.data, params);
    if (syncError) {
      onError(syncError);
      return;
    }

    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: {
        ...macro,
        script: result.data,
        updatedAt: Date.now(),
      },
    });

    if (!response.ok) {
      onError(response.error);
      return;
    }

    onError(null);
    onSaved(response.macros);
    setEditing(false);
    setDirty(false);
  }

  if (editing) {
    return (
      <>
        <label className="ui-field">
          <span className="ui-label">Script JSON</span>
          <textarea
            className="ui-input ui-input--mono"
            rows={12}
            spellCheck={false}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setDirty(true);
            }}
          />
        </label>
        <div className="ui-inline-actions">
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            disabled={!dirty}
            onClick={() => {
              void saveScript();
            }}
          >
            Save script
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost"
            onClick={cancelEditing}
          >
            Cancel
          </button>
        </div>
      </>
    );
  }

  return (
    <details className="ui-disclosure">
      <summary className="ui-disclosure__summary ui-disclosure__summary--row">
        <span>
          {macro.script.steps.length} script step
          {macro.script.steps.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="ui-btn ui-btn--icon"
          aria-label="Edit script"
          onClick={(event) => {
            event.preventDefault();
            startEditing();
          }}
        >
          <Pencil className="ui-icon" size={16} strokeWidth={2} aria-hidden />
        </button>
      </summary>
      <ol className="ui-list--stack">
        {macro.script.steps.map((step, index) => (
          <li key={`${macro.id}-script-${index}`} className="ui-code-item">
            {formatScriptStep(step, index)}
          </li>
        ))}
      </ol>
      <details className="ui-disclosure">
        <summary className="ui-disclosure__summary">Raw script JSON</summary>
        <pre className="ui-code">{JSON.stringify(macro.script, null, 2)}</pre>
      </details>
    </details>
  );
}
