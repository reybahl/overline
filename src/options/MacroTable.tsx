import { Pencil, Trash2 } from "lucide-react";

import { macroEditableDocumentFromMacro } from "@/shared/macro-edit";
import { formatShortcutForDisplay } from "@/shared/shortcut";
import type { Macro } from "@/shared/types/macro";
import { Button } from "@/ui/components";

type MacroTableProps = {
  macros: Macro[];
  onEdit: (macro: Macro) => void;
  onDelete: (macro: Macro) => void;
};

export function MacroTable({ macros, onEdit, onDelete }: MacroTableProps) {
  return (
    <div className="ui-macro-table-wrap">
      <table className="ui-macro-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Description</th>
            <th scope="col">Run on</th>
            <th scope="col">Params</th>
            <th scope="col">Shortcut</th>
            <th scope="col">Script</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {macros.map((macro) => {
            const document = macroEditableDocumentFromMacro(macro);
            const params = document.signature?.params ?? [];
            const paramsLabel = params.length > 0 ? params.map((p) => p.name).join(", ") : "—";

            return (
              <tr key={macro.id}>
                <td>{document.name}</td>
                <td>{document.description ?? "—"}</td>
                <td>
                  {document.runScope ? (
                    <div className="ui-macro-view__run-scope">
                      <code className="ui-macro-view__run-scope-pattern">
                        {document.runScope.pattern}
                      </code>
                      <p className="ui-macro-view__run-scope-description ui-text-muted">
                        {document.runScope.description}
                      </p>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{paramsLabel}</td>
                <td>
                  {macro.shortcut ? (
                    <kbd className="ui-kbd ui-kbd--compact">
                      {formatShortcutForDisplay(macro.shortcut)}
                    </kbd>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {document.script
                    ? `${document.script.steps.length} step${
                        document.script.steps.length === 1 ? "" : "s"
                      }`
                    : "No compiled script — re-record this macro."}
                </td>
                <td>
                  <div className="ui-macro-table__actions">
                    <Button
                      variant="icon"
                      aria-label={`Edit ${macro.name}`}
                      onClick={() => {
                        onEdit(macro);
                      }}
                    >
                      <Pencil className="ui-icon" size={16} strokeWidth={2} aria-hidden />
                    </Button>
                    <Button
                      variant="icon"
                      className="ui-btn--danger"
                      aria-label={`Delete ${macro.name}`}
                      onClick={() => {
                        onDelete(macro);
                      }}
                    >
                      <Trash2 className="ui-icon" size={16} strokeWidth={2} aria-hidden />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
