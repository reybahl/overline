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
import { Button, FieldGroup, Select, TextInput } from "@/ui/components";

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
    const normalized = params.map((param) => ({
      ...param,
      description: param.description?.trim() || undefined,
    }));
    const parsed = ParamsSchema.safeParse(normalized);
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
      {params.map((param, index) => (
          <div key={index} className="ui-stack ui-stack--param">
            <FieldGroup label="Name">
              <TextInput
                mono
                value={param.name}
                spellCheck={false}
                onChange={(event) => {
                  updateParam(index, { name: event.target.value });
                }}
              />
            </FieldGroup>
            <FieldGroup label="Label">
              <TextInput
                value={param.label}
                onChange={(event) => {
                  updateParam(index, { label: event.target.value });
                }}
              />
            </FieldGroup>
            <FieldGroup label="Description">
              <TextInput
                placeholder="Prompt helper text"
                value={param.description ?? ""}
                onChange={(event) => {
                  updateParam(index, { description: event.target.value });
                }}
              />
            </FieldGroup>
            <FieldGroup label="Type">
              <Select
                value={param.type}
                onValueChange={(value) => {
                  updateParam(index, {
                    type: value as MacroParam["type"],
                  });
                }}
                items={[
                  { value: "string", label: "string" },
                  { value: "number", label: "number" },
                ]}
              />
            </FieldGroup>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setParams((current) => current.filter((_, i) => i !== index));
                setDirty(true);
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      <div className="ui-inline-actions">
        <Button
          size="sm"
          onClick={() => {
            setParams((current) => [
              ...current,
              { name: "newParam", label: "New param", type: "string" },
            ]);
            setDirty(true);
          }}
        >
          Add param
        </Button>
        {dirty ? (
          <Button size="sm" onClick={() => void saveParams()}>
            Save params
          </Button>
        ) : null}
      </div>
    </div>
  );
}
