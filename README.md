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
