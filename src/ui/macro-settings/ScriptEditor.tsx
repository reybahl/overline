import { useState } from "react";
import { Pencil } from "lucide-react";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { validateMacroScriptSignature } from "@/shared/macro-signature";
import { formatScriptStepBody } from "@/shared/script-format";
import type { Macro } from "@/shared/types/macro";
import { MacroScriptSchema } from "@/shared/types/script";
import { Button, Disclosure, FieldGroup, TextArea } from "@/ui/components";

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
      type: "SAVE_MACRO_SCRIPT",
      macroId: macro.id,
      script: result.data,
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
        <FieldGroup label="Script JSON">
          <TextArea
            mono
            rows={12}
            spellCheck={false}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setDirty(true);
            }}
          />
        </FieldGroup>
        <div className="ui-inline-actions">
          <Button size="sm" disabled={!dirty} onClick={() => void saveScript()}>
            Save script
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelEditing}>
            Cancel
          </Button>
        </div>
      </>
    );
  }

  return (
    <Disclosure
      summaryClassName="ui-disclosure__summary--row"
      summary={
        <>
          <span>
            {macro.script.steps.length} script step
            {macro.script.steps.length === 1 ? "" : "s"}
          </span>
          <Button
            variant="icon"
            aria-label="Edit script"
            onClick={(event) => {
              event.stopPropagation();
              startEditing();
            }}
          >
            <Pencil className="ui-icon" size={16} strokeWidth={2} aria-hidden />
          </Button>
        </>
      }
    >
      <ol className="ui-list--stack">
        {macro.script.steps.map((step, index) => (
          <li key={`${macro.id}-script-${index}`} className="ui-code-item ui-code-item--row">
            <span className="ui-code-item__lead">
              {index + 1}.
              <span className="ui-badge">{step.type}</span>
            </span>
            <span className="ui-code-item__body">
              {step.label ? <>{step.label} — </> : null}
              {formatScriptStepBody(step)}
            </span>
          </li>
        ))}
      </ol>
      <Disclosure summary="Raw script JSON">
        <pre className="ui-code">{JSON.stringify(macro.script, null, 2)}</pre>
      </Disclosure>
    </Disclosure>
  );
}
