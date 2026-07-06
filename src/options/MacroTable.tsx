import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { macroEditableDocumentFromMacro } from "@/shared/macro-edit";
import { formatShortcutForDisplay } from "@/shared/shortcut";
import type { Macro } from "@/shared/types/macro";
import { Button, TextInput } from "@/ui/components";

type MacroTableProps = {
  macros: Macro[];
  onEdit: (macro: Macro) => void;
  onDelete: (macro: Macro) => void;
};

const columnHelper = createColumnHelper<Macro>();

function scriptLabel(macro: Macro): string {
  const document = macroEditableDocumentFromMacro(macro);
  if (!document.script) {
    return "No compiled script — re-record this macro.";
  }
  const count = document.script.steps.length;
  return `${count} step${count === 1 ? "" : "s"}`;
}

function paramsLabel(macro: Macro): string {
  const params = macroEditableDocumentFromMacro(macro).signature?.params ?? [];
  return params.length > 0 ? params.map((param) => param.name).join(", ") : "—";
}

function runScopeSearchText(macro: Macro): string {
  const runScope = macroEditableDocumentFromMacro(macro).runScope;
  if (!runScope) {
    return "";
  }
  return `${runScope.pattern} ${runScope.description}`;
}

export function MacroTable({ macros, onEdit, onDelete }: MacroTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo(
    () => [
      columnHelper.accessor((macro) => macroEditableDocumentFromMacro(macro).name, {
        id: "name",
        header: "Name",
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor(
        (macro) => macroEditableDocumentFromMacro(macro).description ?? "—",
        {
          id: "description",
          header: "Description",
          cell: ({ getValue }) => getValue(),
        },
      ),
      columnHelper.accessor(runScopeSearchText, {
        id: "runScope",
        header: "Run on",
        cell: ({ row }) => {
          const runScope = macroEditableDocumentFromMacro(row.original).runScope;
          if (!runScope) {
            return "—";
          }
          return (
            <div className="ui-macro-view__run-scope">
              <code className="ui-macro-view__run-scope-pattern">{runScope.pattern}</code>
              <p className="ui-macro-view__run-scope-description ui-text-muted">
                {runScope.description}
              </p>
            </div>
          );
        },
      }),
      columnHelper.accessor(paramsLabel, {
        id: "params",
        header: "Params",
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor(
        (macro) =>
          macro.shortcut ? formatShortcutForDisplay(macro.shortcut) : "—",
        {
          id: "shortcut",
          header: "Shortcut",
          cell: ({ row }) => {
            const shortcut = row.original.shortcut;
            if (!shortcut) {
              return "—";
            }
            return (
              <kbd className="ui-kbd ui-kbd--compact">
                {formatShortcutForDisplay(shortcut)}
              </kbd>
            );
          },
        },
      ),
      columnHelper.accessor(
        (macro) => macroEditableDocumentFromMacro(macro).script?.steps.length ?? -1,
        {
          id: "script",
          header: "Script",
          cell: ({ row }) => scriptLabel(row.original),
        },
      ),
      columnHelper.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <div className="ui-macro-table__actions">
            <Button
              variant="icon"
              aria-label={`Edit ${row.original.name}`}
              onClick={() => {
                onEdit(row.original);
              }}
            >
              <Pencil className="ui-icon" size={16} strokeWidth={2} aria-hidden />
            </Button>
            <Button
              variant="icon"
              className="ui-btn--danger"
              aria-label={`Delete ${row.original.name}`}
              onClick={() => {
                onDelete(row.original);
              }}
            >
              <Trash2 className="ui-icon" size={16} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        ),
      }),
    ],
    [onDelete, onEdit],
  );

  const table = useReactTable({
    data: macros,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="ui-macro-table-section">
      <div className="ui-macro-table-toolbar">
        <TextInput
          type="search"
          className="ui-macro-table-search"
          placeholder="Search macros…"
          value={globalFilter}
          onChange={(event) => {
            setGlobalFilter(event.target.value);
          }}
          aria-label="Search macros"
        />
      </div>

      <div className="ui-macro-table-wrap">
        <table className="ui-macro-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();

                  return (
                    <th key={header.id} scope="col">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="ui-macro-table__sort"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="ui-macro-table__sort-indicator" aria-hidden>
                            {sortDirection === "asc"
                              ? " ↑"
                              : sortDirection === "desc"
                                ? " ↓"
                                : " ↕"}
                          </span>
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="ui-macro-table__empty" colSpan={columns.length}>
                  No matching macros
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
