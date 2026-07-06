import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Button, FieldGroup, Select, TextInput } from "@/ui/components";

const CUSTOM_MODEL_VALUE = "__custom__";

type ModelSelection =
  | { kind: "catalog"; modelId: string }
  | { kind: "custom"; modelId: string };

function resolveModelSelection(
  provider: LlmProvider,
  modelId: string,
): ModelSelection {
  const catalogIds = LLM_CATALOG[provider].map((entry) => entry.id);
  if (catalogIds.some((id) => id === modelId)) {
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

export function LlmSettingsEditor() {
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
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleProviderChange(nextProvider: LlmProvider): void {
    setProvider(nextProvider);
    setModelSelection({
      kind: "catalog",
      modelId: defaultModelForProvider(nextProvider),
    });
  }

  function currentDraft(): LlmSettingsDraft {
    return buildDraft(provider, modelSelection, apiKey, baseURL, name);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);

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
      toast.success("Settings saved");
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to save settings";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(): Promise<void> {
    setTesting(true);

    try {
      const response = await sendBackgroundMessage({
        type: "TEST_LLM_SETTINGS",
        draft: currentDraft(),
      });

      if (!response.ok) {
        throw new Error(response.error);
      }

      toast.success("Connection successful");
    } catch (testError) {
      const message =
        testError instanceof Error
          ? testError.message
          : "Connection test failed";
      toast.error(message);
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

      <FieldGroup label="Provider">
        <Select
          value={provider}
          onValueChange={(value) => {
            handleProviderChange(value as LlmProvider);
          }}
          items={LLM_PROVIDERS.map((entry) => ({
            value: entry,
            label: providerLabel(entry),
          }))}
        />
      </FieldGroup>

      <FieldGroup label="Model">
        {catalog.length > 0 ? (
          <Select
            value={selectValue}
            onValueChange={(value) => {
              if (value === CUSTOM_MODEL_VALUE) {
                setModelSelection({ kind: "custom", modelId: "" });
              } else {
                setModelSelection({ kind: "catalog", modelId: value });
              }
            }}
            items={[
              ...catalog.map((entry) => ({
                value: entry.id,
                label:
                  "note" in entry && entry.note
                    ? `${entry.label} — ${entry.note}`
                    : entry.label,
              })),
              { value: CUSTOM_MODEL_VALUE, label: "Custom model ID…" },
            ]}
          />
        ) : null}
        {catalog.length === 0 || modelSelection.kind === "custom" ? (
          <TextInput
            mono
            placeholder="model-id"
            value={
              modelSelection.kind === "custom" ? modelSelection.modelId : ""
            }
            onChange={(event) => {
              setModelSelection({ kind: "custom", modelId: event.target.value });
            }}
          />
        ) : null}
      </FieldGroup>

      {provider === "openai-compatible" ? (
        <>
          <FieldGroup label="Base URL">
            <TextInput
              type="url"
              mono
              placeholder="https://api.example.com/v1"
              value={baseURL}
              onChange={(event) => {
                setBaseURL(event.target.value);
              }}
            />
          </FieldGroup>
          <FieldGroup label="Provider name">
            <TextInput
              placeholder="openai-compatible"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </FieldGroup>
        </>
      ) : null}

      <FieldGroup label="API key">
        <TextInput
          type="password"
          mono
          placeholder={
            savedSettings?.apiKeyMasked
              ? `Saved (${savedSettings.apiKeyMasked})`
              : "sk-…"
          }
          value={apiKey}
          autoComplete="off"
          onChange={(event) => {
            setApiKey(event.target.value);
          }}
        />
      </FieldGroup>

      <div className="ui-inline-actions">
        <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={testing}
          onClick={() => void handleTest()}
        >
          {testing ? "Testing…" : "Test connection"}
        </Button>
      </div>
    </section>
  );
}
