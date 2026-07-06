import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import {
  formatMacroForEdit,
  parseMacroEditJson,
} from "@/shared/macro-edit";
import type { Macro } from "@/shared/types/macro";
import { Button, FieldGroup, TextArea } from "@/ui/components";

import { MacroEditableView } from "@/ui/macro-settings/MacroEditableView";
import { ShortcutCapture } from "@/ui/macro-settings/ShortcutCapture";

type MacroJsonEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDelete?: () => void;
};

export function MacroJsonEditor({
  macro,
  onSaved,
  onDirtyChange,
  onDelete,
}: MacroJsonEditorProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => formatMacroForEdit(macro));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    onDirtyChange?.(editing && dirty);
  }, [editing, dirty, onDirtyChange]);

  const saveMacro = useCallback(async () => {
    const result = parseMacroEditJson(text, macro);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: result.macro,
    });

    if (!response.ok) {
      toast.error(response.error);
      return;
    }

    toast.success("Saved");
    onSaved(response.macros);
    setDirty(false);
    setEditing(false);
  }, [text, macro, onSaved]);

  useEffect(() => {
    if (!editing) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "s") {
        return;
      }

      event.preventDefault();
      if (dirty) {
        void saveMacro();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dirty, editing, saveMacro]);

  function startEditing(): void {
    setText(formatMacroForEdit(macro));
    setDirty(false);
    setEditing(true);
  }

  function cancelEditing(): void {
    if (dirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }

    setText(formatMacroForEdit(macro));
    setDirty(false);
    setEditing(false);
  }

  function updateText(next: string): void {
    setText(next);
    setDirty(true);
  }

  function reset(): void {
    setText(formatMacroForEdit(macro));
    setDirty(false);
  }

  function renderFooter(): ReactNode {
    if (editing) {
      return null;
    }

    return (
      <div className="ui-card__footer ui-card__footer--split">
        <Button variant="icon" aria-label="Edit macro" onClick={startEditing}>
          <Pencil className="ui-icon" size={16} strokeWidth={2} aria-hidden />
        </Button>
        {onDelete ? (
          <Button
            variant="icon"
            className="ui-btn--danger"
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
          </Button>
        ) : null}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="ui-macro-json-editor">
        <MacroEditableView macro={macro} onSaved={onSaved} />
        {renderFooter()}
      </div>
    );
  }

  return (
    <div className="ui-macro-json-editor">
      <ShortcutCapture macro={macro} text={text} onTextChange={updateText} />

      <FieldGroup label="Editable fields">
        <TextArea
          className="ui-macro-json-editor__textarea"
          mono
          rows={18}
          spellCheck={false}
          value={text}
          onChange={(event) => {
            updateText(event.target.value);
          }}
        />
      </FieldGroup>

      <div className="ui-inline-actions">
        <Button size="sm" disabled={!dirty} onClick={() => void saveMacro()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={reset}>
          Reset
        </Button>
        <Button size="sm" variant="ghost" onClick={cancelEditing}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
