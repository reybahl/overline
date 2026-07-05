import { useState } from "react";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import type { Macro } from "@/shared/types/macro";

type MacroDetailsEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

export function MacroDetailsEditor({
  macro,
  onSaved,
  onError,
}: MacroDetailsEditorProps) {
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
