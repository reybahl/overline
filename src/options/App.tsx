import { useEffect, useState } from "react";

import type { BackgroundMessage, BackgroundResponse } from "@/shared/types/messages";
import type { Macro } from "@/shared/types/macro";

async function sendBackgroundMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  return chrome.runtime.sendMessage(message);
}

export default function App() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await sendBackgroundMessage({ type: "GET_MACROS" });

        if (!response.ok) {
          throw new Error(response.error);
        }

        setMacros(response.macros ?? []);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load macros";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-slate-400">Loading macros…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Patch</h1>
        <p className="text-slate-400">
          Manage macros. Functionality is scaffolded only.
        </p>
      </header>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-medium">Macros</h2>
        {macros.length === 0 ? (
          <p className="text-sm text-slate-400">
            No macros yet. Use <kbd className="rounded bg-slate-800 px-1">⌘⇧Y</kbd> to
            record one.
          </p>
        ) : (
          <ul className="space-y-2">
            {macros.map((macro) => (
              <li
                key={macro.id}
                className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <p className="font-medium">{macro.name}</p>
                <p className="text-sm text-slate-400">
                  {macro.steps.length} steps
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
