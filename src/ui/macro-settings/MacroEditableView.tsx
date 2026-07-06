import { macroEditableDocumentFromMacro } from "@/shared/macro-edit";
import {
  macroEditableFieldKeys,
  type Macro,
  type MacroEditableDocument,
  type RunScope,
} from "@/shared/types/macro";
import { Disclosure } from "@/ui/components";

import { ScriptStepList } from "@/ui/macro-settings/ScriptStepList";
import { ShortcutCapture } from "@/ui/macro-settings/ShortcutCapture";

const FIELD_LABELS: Record<keyof MacroEditableDocument, string> = {
  name: "Name",
  description: "Description",
  runScope: "Run on",
  shortcut: "Shortcut",
  signature: "Params",
  script: "Script",
};

function formatFieldValue(
  key: keyof MacroEditableDocument,
  document: MacroEditableDocument,
): string {
  switch (key) {
    case "name":
      return document.name;
    case "description":
      return document.description ?? "—";
    case "signature": {
      const params = document.signature?.params ?? [];
      return params.map((param) => param.name).join(", ");
    }
    default:
      return "—";
  }
}

function RunScopeValue({ runScope }: { runScope: RunScope }) {
  return (
    <div className="ui-macro-view__run-scope">
      <code className="ui-macro-view__run-scope-pattern">{runScope.pattern}</code>
      <p className="ui-macro-view__run-scope-description ui-text-muted">
        {runScope.description}
      </p>
    </div>
  );
}

function renderFieldValue(
  key: keyof MacroEditableDocument,
  document: MacroEditableDocument,
) {
  if (key === "runScope") {
    if (!document.runScope) {
      return "—";
    }
    return <RunScopeValue runScope={document.runScope} />;
  }

  return formatFieldValue(key, document);
}

function viewFieldKeys(document: MacroEditableDocument): (keyof MacroEditableDocument)[] {
  return macroEditableFieldKeys.filter((key) => {
    if (key === "shortcut" || key === "script") {
      return false;
    }
    if (key === "signature") {
      return (document.signature?.params.length ?? 0) > 0;
    }
    return true;
  });
}

type MacroEditableViewProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
};

export function MacroEditableView({ macro, onSaved }: MacroEditableViewProps) {
  const document = macroEditableDocumentFromMacro(macro);

  return (
    <div className="ui-macro-view">
      <dl className="ui-macro-view__rows">
        {viewFieldKeys(document).map((key) => (
          <div key={key} className="ui-macro-view__row">
            <dt className="ui-macro-view__label ui-text-muted">{FIELD_LABELS[key]}</dt>
            <dd className="ui-macro-view__value">{renderFieldValue(key, document)}</dd>
          </div>
        ))}
        <div className="ui-macro-view__row ui-macro-view__row--shortcut">
          <dt className="ui-macro-view__label ui-text-muted">Shortcut</dt>
          <dd className="ui-macro-view__value">
            <ShortcutCapture macro={macro} onSaved={onSaved} variant="inline" />
          </dd>
        </div>
      </dl>

      {document.script ? (
        <Disclosure
          className="ui-macro-view__script"
          summaryClassName="ui-macro-view__script-summary"
          summary={`${document.script.steps.length} step${
            document.script.steps.length === 1 ? "" : "s"
          }`}
        >
          <ScriptStepList script={document.script} macroId={macro.id} />
        </Disclosure>
      ) : (
        <p className="ui-text-muted ui-macro-view__empty-script">
          No compiled script — re-record this macro.
        </p>
      )}
    </div>
  );
}
