import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/options/ConfirmDialog";
import { LlmSettingsEditor } from "@/options/LlmSettingsEditor";
import { sendBackgroundMessage } from "@/shared/clients/background-client";
import { saveMacros } from "@/shared/clients/storage";
import type { Macro } from "@/shared/types/macro";
import { formatShortcutForDisplay } from "@/shared/shortcut";
import { MacroSettingsBody } from "@/ui/macro-settings/MacroSettingsBody";

type MacroCardProps = {
  macro: Macro;
  onSaved: (macros: Macro[]) => void;
  onError: (message: string | null) => void;
  onDelete: () => void;
};

function MacroCard({ macro, onSaved, onError, onDelete }: MacroCardProps) {
  const summaryDescription = macro.description ?? macro.intent;

  return (
    <details className="ui-card">
      <summary className="ui-card__summary">
        <div className="ui-card__summary-main">
          <div className="ui-card__heading">
            <span className="ui-card__title">{macro.name}</span>
            {macro.shortcut ? (
              <kbd className="ui-kbd ui-kbd--compact">
                {formatShortcutForDisplay(macro.shortcut)}
              </kbd>
            ) : null}
          </div>
          {summaryDescription ? (
            <p className="ui-card__meta">{summaryDescription}</p>
          ) : null}
        </div>
      </summary>

      <div className="ui-card__body">
        <MacroSettingsBody
          macro={macro}
          onSaved={onSaved}
          onError={onError}
          onDelete={onDelete}
        />
      </div>
    </details>
  );
}

export default function App() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [macroPendingDelete, setMacroPendingDelete] = useState<Macro | null>(null);
  const [clearAllPending, setClearAllPending] = useState(false);

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
  }

  function handleMacroSaved(macros: Macro[]): void {
    setMacros(macros);
    toast.success("Saved");
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
              AI settings, saved macros, shortcuts, and run scope.
            </p>
          </div>
          {macros.length > 0 ? (
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--destructive"
              onClick={() => {
                setClearAllPending(true);
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>
      </header>

      <LlmSettingsEditor />

      {macros.length === 0 ? (
        <p className="ui-text-muted">
          No macros yet. Open Overline on a page and choose Record.
        </p>
      ) : (
        <ul className="ui-stack ui-stack--loose">
          {macros.map((macro) => (
            <li key={macro.id}>
              <MacroCard
                macro={macro}
                onSaved={handleMacroSaved}
                onError={(message) => {
                  if (message) {
                    toast.error(message);
                  }
                }}
                onDelete={() => {
                  setMacroPendingDelete(macro);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      </main>

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
