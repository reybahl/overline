import { useState } from "react";
import { z } from "zod";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import {
  getParamRefsInScript,
  macroNeedsParams,
  validateMacroScriptSignature,
} from "@/shared/macro-signature";
import type { Macro } from "@/shared/types/macro";
import { MacroParamSchema, type MacroParam } from "@/shared/types/macro-signature";

const ParamsSchema = z.array(MacroParamSchema);

type MacroParamsEditorProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
};

export function MacroParamsEditor({
  macro,
  onSaved,
  onError,
}: MacroParamsEditorProps) {
  const scriptRefs = macro.script ? getParamRefsInScript(macro.script) : new Set<string>();
  const [params, setParams] = useState<MacroParam[]>(() => macro.signature?.params ?? []);
  const [dirty, setDirty] = useState(false);

  if (!macro.script || (scriptRefs.size === 0 && !macroNeedsParams(macro))) {
    return null;
  }

  function updateParam(index: number, patch: Partial<MacroParam>): void {
    setParams((current) =>
      current.map((param, i) => (i === index ? { ...param, ...patch } : param)),
    );
    setDirty(true);
  }

  async function saveParams(): Promise<void> {
    const parsed = ParamsSchema.safeParse(params);
    if (!parsed.success) {
      onError(parsed.error.issues[0]?.message ?? "Invalid param.");
      return;
    }

    if (macro.script) {
      const syncError = validateMacroScriptSignature(macro.script, parsed.data);
      if (syncError) {
        onError(syncError);
        return;
      }
    }

    const response = await sendBackgroundMessage({
      type: "SAVE_MACRO",
      macro: {
        ...macro,
        signature: { version: 1, params: parsed.data },
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
      <p className="ui-section__title">Params</p>
      {params.length === 0 ? (
        <p className="ui-text-muted">No params defined.</p>
      ) : null}
      {params.map((param, index) => {
        const nameLocked = scriptRefs.has(param.name);
        return (
          <div key={index} className="ui-stack ui-stack--param">
            <label className="ui-field">
              <span className="ui-label">Name</span>
              <input
                type="text"
                className="ui-input ui-input--mono"
                value={param.name}
                readOnly={nameLocked}
                spellCheck={false}
                onChange={(event) => {
                  updateParam(index, { name: event.target.value });
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-label">Label</span>
              <input
                type="text"
                className="ui-input"
                value={param.label}
                onChange={(event) => {
                  updateParam(index, { label: event.target.value });
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-label">Description</span>
              <input
                type="text"
                className="ui-input"
                value={param.description ?? ""}
                placeholder="Prompt helper text"
                onChange={(event) => {
                  updateParam(index, {
                    description: event.target.value.trim() || undefined,
                  });
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-label">Type</span>
              <select
                className="ui-input"
                value={param.type}
                onChange={(event) => {
                  updateParam(index, {
                    type: event.target.value as MacroParam["type"],
                  });
                }}
              >
                <option value="string">string</option>
                <option value="number">number</option>
              </select>
            </label>
            {nameLocked ? (
              <p className="ui-text-muted">
                {`{{${param.name}}}`} is used in the script — update the script before renaming or
                removing.
              </p>
            ) : (
              <button
                type="button"
                className="ui-btn ui-btn--sm ui-btn--ghost"
                onClick={() => {
                  setParams((current) => current.filter((_, i) => i !== index));
                  setDirty(true);
                }}
              >
                Remove
              </button>
            )}
          </div>
        );
      })}
      <div className="ui-inline-actions">
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          onClick={() => {
            setParams((current) => [
              ...current,
              { name: "newParam", label: "New param", type: "string" },
            ]);
            setDirty(true);
          }}
        >
          Add param
        </button>
        {dirty ? (
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            onClick={() => {
              void saveParams();
            }}
          >
            Save params
          </button>
        ) : null}
      </div>
    </div>
  );
}
