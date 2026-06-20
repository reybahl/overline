# CDP Driver — Capture & Playback via Chrome DevTools Protocol

## TL;DR

Today we capture the page and replay actions from a **content script**. That has
two hard ceilings:

1. **Capture blindness.** We build CSS selectors and read `aria-label`/text by
   hand. Icon-only controls (GitHub's copy button: a `<button>` whose only label
   is `aria-labelledby="_r_h_"` pointing at an off-DOM node, no text, unstable
   generated class) are effectively invisible to us. The agent can't see the
   element, so it loops.
2. **Untrusted input.** `element.click()` produces an event with
   `isTrusted = false` and **no user activation**. Gesture-gated APIs
   (`navigator.clipboard.writeText`, file pickers, `window.open`, autoplay, etc.)
   silently no-op or fall back. That's why "copy" looked successful in logs but
   the clipboard was empty.

The Chrome DevTools Protocol (CDP), reached from the extension via
`chrome.debugger`, fixes **both** with one mechanism:

- **`Accessibility.getFullAXTree`** → the browser's own computed accessibility
  tree: role, computed name (already resolves `aria-labelledby`, `aria-label`,
  `title`, `<label>`, alt text…), value, and state (checked/selected/expanded/
  disabled/focusable) for every node, plus a `backendDOMNodeId` handle. This is
  exactly the element list the agent needs — no hand-rolled selectors.
- **`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`** → **trusted** input
  with real user activation. Copy, pickers, etc. just work.

This is "the right fix" because it deletes whole categories of heuristics
(`getAccessibleName`, `buildSelector`, copy quirks, focus hacks) instead of
adding more.

---

## Why CDP specifically (alternatives considered)

| Problem | Content-script options | CDP |
| --- | --- | --- |
| See icon-only / aria-labelledby controls | Reimplement the accname algorithm ourselves (large, perpetually wrong on edge cases) | Free, exact, browser-computed |
| Trusted gesture for copy/pickers | **Not possible** from a content script | `Input.dispatch*` |
| Stable cross-session identity | CSS selectors (brittle, what we have) | role + computed name + ordinal |

A non-CDP "accessible-name matching" pass would fix capture #1 only — it cannot
produce trusted input, so copy would still fail. CDP is the single mechanism
that covers both, which is why it wins despite the costs below.

---

## Costs / risks (eyes open)

- **Permission:** requires `"debugger"` in the manifest. Heavier store review.
- **Infobar:** Chrome shows a persistent *"Patch started debugging this
  browser"* banner while attached. Mitigate by attaching only for the duration
  of a run and detaching immediately after.
- **One client per tab:** can't attach if the user has DevTools open on that tab.
  Must detect (`chrome.debugger.onDetach` / attach error) and surface a clear
  message.
- **MV3 worker eviction:** the service worker can be killed mid-run, dropping the
  session. Need re-attach + recoverable run state (we already keep run state).
- **Coordinate clicks:** `Input.dispatchMouseEvent` is geometry-based, so we must
  `DOM.scrollIntoViewIfNeeded` + `DOM.getBoxModel` and click the center; handle
  occluded/zero-size nodes.
- **Dual path during migration:** existing v1 (CSS-selector) macros must keep
  running while v2 (a11y) rolls out.

---

## Architecture

```
background/
  cdp/
    driver.ts        // attach/detach lifecycle, send<T>(), per-tab session map
    capture.ts       // AX tree -> ElementSnapshot[]
    playback.ts      // ElementMatch -> resolve AX node -> trusted Input events
    types.ts         // AX node shapes we care about
```

- **`driver.ts`** owns `chrome.debugger.attach({ tabId }, "1.3")`, a typed
  `send(tabId, method, params)`, `onDetach` handling, and guaranteed `detach`
  (run end / tab close / error). Never leave a tab attached.
- **Capture** walks `Accessibility.getFullAXTree`, keeps nodes with interactive
  roles (button, link, textbox, checkbox, radio, tab, menuitem, combobox…),
  and emits `{ role, name, value, states, backendNodeId, frameId, bbox }`.
  `buildSelector` / `getAccessibleName` / `getFieldValue` go away.
- **Match model (v2):** store `{ role, name, ordinal, value? }` — stable across
  reloads (unlike `backendNodeId`, which is per-document). `backendNodeId` is
  used only within a single live run for speed.
- **Playback** resolves a match to an AX node, `DOM.resolveNode` →
  `DOM.getBoxModel`, scrolls into view, then dispatches
  `mouseMoved → mousePressed → mouseReleased`. Fills use `DOM.focus` +
  `Input.insertText`; keys via `Input.dispatchKeyEvent`. No `focusTabForPlayback`
  hack needed — trusted input carries activation.

---

## Phasing (each phase shippable)

**Phase 1 — Trusted clicks for existing macros (fastest copy win).**
Attach via CDP, but keep the current CSS-selector match. Resolve the selector
with `DOM.querySelector` → `getBoxModel` → trusted `Input` click. This alone
makes **copy work today** without touching capture. Small, low-risk, high-value.

**Phase 2 — AX-tree capture.**
Replace `captureDom` with the AX walk so the agent finally *sees* icon-only
buttons. Snapshot payloads also shrink (no serialized selectors) — helps the TPM
problem too.

**Phase 3 — a11y match schema (v2) + migration.**
New `ElementMatch` based on role+name+ordinal; migrate or dual-run v1 scripts;
retire `script-sanitize` CSS heuristics and CSS fields in `types/script.ts`.

**Phase 4 — Coverage.**
Keyboard, drag, hover, scroll-into-view edge cases, cross-origin iframes (the AX
tree spans frames via `frameId`).

**Fallback:** if `debugger` attach fails (permission denied / DevTools open),
fall back to the current synthetic content-script path so nothing hard-breaks.

---

## Manifest / permissions

```jsonc
// src/manifest.json
"permissions": ["debugger", /* existing */]
```

Document the infobar + DevTools-conflict UX in the extension's permission
rationale.

---

## Relationship to `feat/macro-reliability-wip`

CDP **supersedes** most of that branch's capture/match code. See the branching
diagnosis in chat; the short version:

- **Superseded by CDP** (will be deleted by Phase 2/3): `dom-capture` accessible-
  name/selector/field heuristics, `visibility.ts`, `script-sanitize` CSS
  remapping, `script-match` id normalization, CSS fields in `types/script.ts`.
- **Independent / keep regardless of CDP:** `agent-loop.ts` repeat-guard
  softening, the state-aware prompt rule in `worker.ts`, and (for Phase 1)
  `focusTabForPlayback` in `play.ts`.
