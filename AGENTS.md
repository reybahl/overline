# Patch — agent notes

Architecture and regression traps for the recording → compile → playback pipeline.

## Pipeline roles

| Phase | Job |
|---|---|
| **Brief (`goal` only)** | One sentence end-state reminder for the recorder — not steps, avoid lists, or doneWhen |
| **Recorder** | Discover clicks turn-by-turn from live DOM; mark done when goal is reached |
| **Compile** | 1:1 generalize demo steps → script + description; never drop navigation steps |
| **Run scope** | One **start page type** only (from `startUrl` / first step `pageUrl`) — not repo OR profile |
| **Post-compile sanitize** | Structural only: strip unstable ids, strip text with `hrefFromPathSegment`, strip `hrefFromPathSegment` when `hrefPattern` is set |
| **Playback** | Execute script; pre-click `waitFor` for next target after prior step settles |

## Recording plan — keep minimal

The brief is only `{ goal }`. Do not re-add `steps`, `avoid`, or `doneWhen` — they caused contradictory instructions (e.g. listing the profile link in `avoid` while the recorder needed to click it).

## Compile rules (do not regress)

- **One output step per demo step** — same count, same order. Navigation hops (repo → profile) are required, not detours.
- **`hrefFromPathSegment`** — when demo `pageUrl` is multi-segment and clicked href is bare `/{segmentN}` with **no query string**. Omit `text` / `textContains`.
- **Tab/query links** (`?tab=followers`) — use `hrefPattern: "\\?tab=followers"` (+ `textContains` if needed). Never `hrefFromPathSegment` on query hrefs. Never combine `hrefFromPathSegment` + `hrefPattern`.
- **`testId`** — only when that demo step's `recordedMatch` had `testId`. Never invent (e.g. `followers-tab`).
- **Description** — compile generates generalized `macro.description`, not the recorder.

## Capture (`deriveElementMatch`)

- Collect **href + text + testId together** — no early return on `testId` alone.
- Store `hrefSuffix` as pathname + search (not full absolute URL).

## Playback — navigation vs in-page UI

### Followers macro fix (regression trap)

Symptom: step 1 runs, step 2 `waitFor` times out on repo page.

Cause: pre-click wait for step 2 ran before navigation from step 1 finished.

Fixes (all required):

1. **`waitForUrlChangeAfterClick`** — before step N pre-click wait, poll up to 20s for URL change from step N−1 — **only when previous click match has href navigation fields** (`hrefFromPathSegment`, `hrefPattern`, `hrefContains`, `hrefSuffix`). Never after button/dropdown clicks.
2. **`settleAfterStep`** — in-page clicks (`expectNavigation: false`): no URL poll, **250ms** `IN_PAGE_SETTLE_MS`. Href clicks: 400ms URL peek only; full navigation wait is `waitForUrlChangeAfterClick` before the next step.
3. Do **not** use a multi-second `URL_CHANGE_DETECT_MS` on every click — that regressed dropdown macros (~3s stall per step).

### Pre-click wait

After each click step, `runMacroScript` waits for the **next** step's match before clicking (unless previous step was an explicit `waitFor` with the same match). Returns immediately (`ms: 0`) when the target is already in the DOM. Only polls up to 20s when the target appears late (e.g. dropdown still opening).

### Run scope

Macro runs from **one page shape**. Example: recorded from repo → `^https://github\.com/[^/]+/[^/]+(?:/.*)?$` — not profile URLs.

## Example: View Author Followers (from repo)

```json
[
  { "type": "click", "match": { "tag": "a", "hrefFromPathSegment": 0 } },
  { "type": "click", "match": { "tag": "a", "textContains": "followers", "hrefPattern": "\\?tab=followers" } }
]
```

## Example: Copy GitHub CLI (in-page dropdown)

```json
[
  { "type": "click", "match": { "tag": "button", "text": "Code" } },
  { "type": "click", "match": { "tag": "a", "textContains": "GitHub CLI" } },
  { "type": "click", "match": { "tag": "button", "ariaLabel": "Copy command to clipboard" } }
]
```

No href fields on step 1 → no navigation wait before step 2. Pre-click wait for "GitHub CLI" should resolve quickly once the Code menu opens.
