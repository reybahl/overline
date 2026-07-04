# Overline Privacy Policy

**Effective date:** July 4, 2026

Overline records and runs browser macros. No accounts, no developer-operated servers, no analytics.

## Stored locally

In `chrome.storage.local`: macros, AI settings (including your API key), and in-progress recordings. Delete via Overline options or remove the extension.

## Read from websites

On pages where you use Overline: interactive elements (labels, text, links, buttons, inputs, ARIA state), page URLs, and element positions for playback.

## Sent to third parties

When you record a macro, Overline sends prompts to the **LLM provider you configure**, using **your API key**. This includes your intent, element summaries, and demo steps. Requests go directly from your browser to that provider; their privacy policy applies. No other third parties receive your data.

During playback, Overline may temporarily attach the `debugger` permission for trusted clicks, then detach.

## Limited Use

Overline's use of information received from Google APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies), including Limited Use requirements. Page data is used only for macro recording and playback.

## Contact

[GitHub Issues](https://github.com/reybahl/patch/issues)
