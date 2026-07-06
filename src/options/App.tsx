import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/options/ConfirmDialog";
import { LlmSettingsDialog } from "@/options/LlmSettingsDialog";
import { MacroTable } from "@/options/MacroTable";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { saveMacros } from "@/shared/clients/storage";
import type { Macro } from "@/shared/types/macro";
import { MacroSettingsDialog } from "@/ui/macro-settings/MacroSettingsDialog";
import { Button } from "@/ui/components";

export default function App() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [macroPendingDelete, setMacroPendingDelete] = useState<Macro | null>(null);
  const [clearAllPending, setClearAllPending] = useState(false);
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const macrosResponse = await sendBackgroundMessage({ type: "GET_MACROS" });

        if (!macrosResponse.ok) {
          throw new Error(macrosResponse.error);
        }

        setMacros(macrosResponse.macros);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load macros";
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function confirmDeleteMacro(): Promise<void> {
    if (!macroPendingDelete) {
      return;
    }

    const macro = macroPendingDelete;
    setMacroPendingDelete(null);

    const response = await sendBackgroundMessage({
      type: "DELETE_MACRO",
      macroId: macro.id,
    });

    if (!response.ok) {
      toast.error(response.error);
      return;
    }

    setMacros(response.macros);
    toast.success(`Deleted "${macro.name}"`);
  }

  function handleMacroSaved(nextMacros: Macro[]): void {
    setMacros(nextMacros);
  }

  async function confirmClearAll(): Promise<void> {
    setClearAllPending(false);

    try {
      await saveMacros([]);
      setMacros([]);
    } catch (clearError) {
      const message =
        clearError instanceof Error ? clearError.message : "Failed to clear macros";
      toast.error(message);
    }
  }

  if (loading) {
    return (
      <main className="ui-page">
        <p className="ui-text-muted">Loading macros…</p>
      </main>
    );
  }

  return (
    <>
      <main className="ui-page ui-page--options">
        <header className="ui-page-header">
          <div className="ui-options-header">
            <div>
              <h1 className="ui-header__title ui-header__title--lg">Overline</h1>
              <p className="ui-header__subtitle">
                Saved macros, shortcuts, and run scope.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLlmSettingsOpen(true);
              }}
            >
              AI settings
            </Button>
          </div>
        </header>

        {macros.length === 0 ? (
          <p className="ui-text-muted">
            No macros yet. Open Overline on a page and choose Record.
          </p>
        ) : (
          <>
            <MacroTable
              macros={macros}
              onEdit={setEditingMacro}
              onDelete={setMacroPendingDelete}
            />
            <div className="ui-options-footer">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setClearAllPending(true);
                }}
              >
                Clear all
              </Button>
            </div>
          </>
        )}
      </main>

      <LlmSettingsDialog
        open={llmSettingsOpen}
        onClose={() => {
          setLlmSettingsOpen(false);
        }}
      />

      {editingMacro ? (
        <MacroSettingsDialog
          key={`${editingMacro.id}-${editingMacro.updatedAt}`}
          macro={editingMacro}
          open
          onClose={() => {
            setEditingMacro(null);
          }}
          onSaved={handleMacroSaved}
        />
      ) : null}

      <ConfirmDialog
        open={clearAllPending}
        title="Clear all macros?"
        message={`All ${macros.length} saved macro${
          macros.length === 1 ? "" : "s"
        } will be permanently removed.`}
        confirmLabel="Clear all"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void confirmClearAll();
        }}
        onCancel={() => {
          setClearAllPending(false);
        }}
      />

      <ConfirmDialog
        open={macroPendingDelete !== null}
        title="Delete macro?"
        message={
          macroPendingDelete
            ? `"${macroPendingDelete.name}" will be permanently removed.`
            : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          void confirmDeleteMacro();
        }}
        onCancel={() => {
          setMacroPendingDelete(null);
        }}
      />
    </>
  );
}
