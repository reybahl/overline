import { useEffect, useState } from "react";

import { sendBackgroundMessage } from "@/shared/clients/background-client";
import {
  LLM_CATALOG,
  LLM_PROVIDERS,
  defaultModelForProvider,
  providerLabel,
  type LlmProvider,
  type LlmSettingsDraft,
  type LlmSettingsPublic,
} from "@/shared/llm";

const CUSTOM_MODEL_VALUE = "__custom__";

type ModelSelection =
  | { kind: "catalog"; modelId: string }
  | { kind: "custom"; modelId: string };

function resolveModelSelection(
  provider: LlmProvider,
  modelId: string,
): ModelSelection {
  const catalogIds = LLM_CATALOG[provider].map((entry) => entry.id);
  if (catalogIds.includes(modelId)) {
    return { kind: "catalog", modelId };
  }
  return { kind: "custom", modelId };
}

function buildDraft(
  provider: LlmProvider,
  modelSelection: ModelSelection,
  apiKey: string,
  baseURL: string,
  name: string,
): LlmSettingsDraft {
  const modelId =
    modelSelection.kind === "catalog"
      ? modelSelection.modelId
      : modelSelection.modelId.trim();

  const trimmedKey = apiKey.trim();
  const apiKeyField = trimmedKey ? { apiKey: trimmedKey } : {};

  if (provider === "openai-compatible") {
    return {
      provider,
      modelId,
      baseURL: baseURL.trim(),
      name: name.trim() || "openai-compatible",
      ...apiKeyField,
    };
  }

  return {
    provider,
    modelId,
    ...apiKeyField,
  };
}

type LlmSettingsEditorProps = {
  onError: (message: string | null) => void;
};

export function LlmSettingsEditor({ onError }: LlmSettingsEditorProps) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [savedSettings, setSavedSettings] = useState<LlmSettingsPublic | null>(
    null,
  );

  const [provider, setProvider] = useState<LlmProvider>("openai");
  const [modelSelection, setModelSelection] = useState<ModelSelection>({
    kind: "catalog",
    modelId: defaultModelForProvider("openai"),
  });
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [name, setName] = useState("openai-compatible");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await sendBackgroundMessage({ type: "GET_LLM_SETTINGS" });
        if (!response.ok) {
          throw new Error(response.error);
        }

        setConfigured(response.configured);
        setSavedSettings(response.settings);

        if (response.settings) {
          const loaded = response.settings;
          setProvider(loaded.provider);
          setModelSelection(
            resolveModelSelection(loaded.provider, loaded.modelId),
          );
          if (loaded.provider === "openai-compatible") {
            setBaseURL(loaded.baseURL);
            setName(loaded.name);
          }
        }
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load AI settings";
        onError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [onError]);

  function handleProviderChange(nextProvider: LlmProvider): void {
    setProvider(nextProvider);
    setModelSelection({
      kind: "catalog",
      modelId: defaultModelForProvider(nextProvider),
    });
    setTestStatus(null);
  }

  function currentDraft(): LlmSettingsDraft {
    return buildDraft(provider, modelSelection, apiKey, baseURL, name);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setTestStatus(null);
    onError(null);

    try {
      const response = await sendBackgroundMessage({
        type: "SAVE_LLM_SETTINGS",
        draft: currentDraft(),
      });

      if (!response.ok) {
        throw new Error(response.error);
      }

      setConfigured(true);
      setSavedSettings(response.settings);
      setApiKey("");
      setTestStatus("Settings saved.");
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to save settings";
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);
    setTestStatus(null);
    onError(null);

    try {
      const response = await sendBackgroundMessage({
        type: "TEST_LLM_SETTINGS",
        draft: currentDraft(),
      });

      if (!response.ok) {
        throw new Error(response.error);
      }

      setTestStatus("Connection successful.");
    } catch (testError) {
      const message =
        testError instanceof Error
          ? testError.message
          : "Connection test failed";
      onError(message);
    } finally {
      setTesting(false);
    }
  }

  const catalog = LLM_CATALOG[provider];
  const selectValue =
    modelSelection.kind === "catalog"
      ? modelSelection.modelId
      : CUSTOM_MODEL_VALUE;

  if (loading) {
    return (
      <section className="ui-section">
        <p className="ui-text-muted">Loading AI settings…</p>
      </section>
    );
  }

  return (
    <section className="ui-section">
      <p className="ui-section__title">AI settings</p>

      {!configured ? (
        <p className="ui-alert">
          Add your API key and model to enable recording and compile.
        </p>
      ) : (
        <p className="ui-text-muted">
          Configured — {providerLabel(provider)} · {savedSettings?.modelId}
          {savedSettings ? ` · ${savedSettings.apiKeyMasked}` : null}
        </p>
      )}

      <label className="ui-field">
        <span className="ui-label">Provider</span>
        <select
          className="ui-input"
          value={provider}
          onChange={(event) => {
            handleProviderChange(event.target.value as LlmProvider);
          }}
        >
          {LLM_PROVIDERS.map((entry) => (
            <option key={entry} value={entry}>
              {providerLabel(entry)}
            </option>
          ))}
        </select>
      </label>

      <label className="ui-field">
        <span className="ui-label">Model</span>
        {catalog.length > 0 ? (
          <select
            className="ui-input"
            value={selectValue}
            onChange={(event) => {
              const value = event.target.value;
              if (value === CUSTOM_MODEL_VALUE) {
                setModelSelection({ kind: "custom", modelId: "" });
              } else {
                setModelSelection({ kind: "catalog", modelId: value });
              }
              setTestStatus(null);
            }}
          >
            {catalog.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
                {entry.note ? ` — ${entry.note}` : ""}
              </option>
            ))}
            <option value={CUSTOM_MODEL_VALUE}>Custom model ID…</option>
          </select>
        ) : null}
        {catalog.length === 0 || modelSelection.kind === "custom" ? (
          <input
            type="text"
            className="ui-input ui-input--mono"
            placeholder="model-id"
            value={
              modelSelection.kind === "custom" ? modelSelection.modelId : ""
            }
            onChange={(event) => {
              setModelSelection({ kind: "custom", modelId: event.target.value });
              setTestStatus(null);
            }}
          />
        ) : null}
      </label>

      {provider === "openai-compatible" ? (
        <>
          <label className="ui-field">
            <span className="ui-label">Base URL</span>
            <input
              type="url"
              className="ui-input ui-input--mono"
              placeholder="https://api.example.com/v1"
              value={baseURL}
              onChange={(event) => {
                setBaseURL(event.target.value);
                setTestStatus(null);
              }}
            />
          </label>
          <label className="ui-field">
            <span className="ui-label">Provider name</span>
            <input
              type="text"
              className="ui-input"
              placeholder="openai-compatible"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setTestStatus(null);
              }}
            />
          </label>
        </>
      ) : null}

      <label className="ui-field">
        <span className="ui-label">API key</span>
        <input
          type="password"
          className="ui-input ui-input--mono"
          placeholder={
            savedSettings?.apiKeyMasked
              ? `Saved (${savedSettings.apiKeyMasked})`
              : "sk-…"
          }
          value={apiKey}
          autoComplete="off"
          onChange={(event) => {
            setApiKey(event.target.value);
            setTestStatus(null);
          }}
        />
      </label>

      <div className="ui-inline-actions">
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          disabled={saving}
          onClick={() => {
            void handleSave();
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--sm ui-btn--ghost"
          disabled={testing}
          onClick={() => {
            void handleTest();
          }}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>

      {testStatus ? <p className="ui-text-muted">{testStatus}</p> : null}
    </section>
  );
}
