import { useEffect, useState } from "react";

import type { BackgroundMessage, BackgroundResponse } from "@/shared/types/messages";
import type { Macro, MacroStep } from "@/shared/types/macro";

function formatStep(step: MacroStep, index: number): string {
  const parts = [`${index + 1}. ${step.type}`];
  if (step.selector) parts.push(step.selector);
  if (step.value) parts.push(`"${step.value}"`);
  return parts.join(" · ");
}

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
        <p className="text-slate-400">Manage saved macros.</p>
      </header>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-medium">Macros</h2>
        {macros.length === 0 ? (
          <p className="text-sm text-slate-400">
            No macros yet. Click the Patch icon and choose{" "}
            <span className="font-medium text-slate-300">Record macro</span>.
          </p>
        ) : (
          <ul className="space-y-2">
            {macros.map((macro) => (
              <li
                key={macro.id}
                className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <p className="font-medium">{macro.name}</p>
                {macro.description ? (
                  <p className="mt-1 text-sm text-slate-400">
                    {macro.description}
                  </p>
                ) : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300">
                    {macro.steps.length}{" "}
                    {macro.steps.length === 1 ? "step" : "steps"}
                  </summary>
                  <ol className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                    {macro.steps.map((step, index) => (
                      <li
                        key={step.id}
                        className="rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-slate-300"
                      >
                        {formatStep(step, index)}
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
