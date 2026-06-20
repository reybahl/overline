/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_MODEL?: string;
  readonly VITE_LLM_PROVIDER?: string;
  readonly VITE_GROQ_API_KEY?: string;
  readonly VITE_GROQ_MODEL?: string;
  readonly VITE_XAI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
