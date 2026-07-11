# Overline

Browser extension for AI-assisted macros on Chromium browsers (Chrome, Edge, Arc, Helium, etc.). Record a workflow once, then run it again from a command palette (`⌘⇧P` / `Ctrl⇧P`).

Fully local: no accounts, no Overline servers, no database, no analytics. Macros and settings live in extension storage. Recording uses **bring your own key (BYOK)**. Requests go from your browser straight to the LLM provider you configure (OpenAI, xAI, Anthropic, Google, or any OpenAI compatible endpoint).

## Local development

Requires [Bun](https://bun.com/).

```bash
bun install
bun run dev
```

Then in your browser:

1. Open the extensions page (i.e. `chrome://extensions`)
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. After code changes, reload the extension on that page

Open Overline extension options to add your LLM provider API key before recording.

### Other useful commands

```bash
bun run build      # production build → dist/
bun typecheck
bun test
bun lint
```



## Architecture

Pipeline: record → compile → sanitize → playback.


| Area              | Role                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/background/` | Service worker: messaging, recording/compile LLM calls, playback orchestration, CDP trusted-click fallback |
| `src/content/`    | In-page DOM capture, element matching, step execution, shortcuts, overlay host                             |
| `src/window/`     | Command palette UI (record, run, review)                                                                   |
| `src/options/`    | Macro list + BYOK LLM settings                                                                             |
| `src/shared/`     | Types, storage clients, script sanitize/match, timing, LLM helpers                                         |
| `src/ui/`         | Shared UI primitives and styles                                                                            |


Recording and compile use LLMs, but sanitize + playback stay deterministic. Running a macro after generation does not call any LLMs and therefore behaves consistently across runs.

## Stack

- TypeScript (strict)
- React 19 for options / settings UI
- Vite + `vite-plugin-web-extension` (Manifest V3)
- Bun for install, scripts, and tests
- Vercel AI SDK (`ai` + provider packages) for BYOK LLM calls
- Zod for schemas; Base UI + Lucide for UI

