# Patch — do not regress

Recording → compile → playback. Trust the LLM for recording and compile; enforce correctness with thin deterministic sanitize + playback timing. No site-specific hacks.

## Pipeline shape

- **Recorder:** one LLM turn per click from live DOM + user intent. No separate recording plan (`steps`, `avoid`, `doneWhen`) or plan LLM call.
- **Compile:** one output click/fill per demo step — same count, same order. Never drop navigation hops. Generalize each step's `recordedMatch`; do not invent targets.
- **Sanitize:** deterministic post-compile only — not a second LLM pass.
- **Run scope:** one start page type from `startUrl` / first step `pageUrl`, not `endUrl`. Same path segment count; slugs → `[^/]+`.
- **Playback:** pre-click `waitFor` for the next target; navigation wait only when the previous click match has href fields.

## Recording

- Never emit `navigate` — click links and buttons.
- Never navigate backwards.
- `done: true` only when intent is fully satisfied on the current page, never on an intermediate stop, never before at least one action.
- Missing control → `waitFor`, not `done` with a substitute target.
- Store `pageUrl` on click/fill steps — compile href rules depend on it.

## Capture (`deriveElementMatch`)

- Stable `id` only when `isStableId` — then early return with `{ id }` only.
- Otherwise capture **all** of tag, testId, href, text, ariaLabel together. Do not early-return on testId alone and skip href/text.
- `hrefSuffix` = pathname + search (not full absolute URL).

## Compile

- Translate demo `recordedMatch`; never add fields absent from that step (especially `testId`, `ariaLabel`, `textContains`).
- Unstable ids (React `useId`, `_r_*`, Radix, long hex) → drop `id`; use text/aria/href from the same capture.
- Text with counts/badges → `textContains` with static words only.
- **hrefFromPathSegment:** bare `/{segmentN}` from this step's `pageUrl`, no query — no text fields.
- **Query/tab hrefs** (`?tab=…`): `hrefPattern`, never `hrefFromPathSegment`.
- Scoped paths: `hrefPattern` preserving segment count.
- Never combine `hrefFromPathSegment` with `hrefPattern` or text fields.
- Do not insert extra `waitFor` steps — playback owns timing between actions.
- Description from compile with generalized roles ("the owner", "the current repository") — not raw intent, session URLs, or slugs.

## Sanitize (`sanitizeCompiledScript`)

- **Ground to demo:** drop any match field not present on (or generalizable from) that step's `recordedMatch`. This is the guardrail against compile hallucinations — not more prompt text.
- Allowed generalizations: demo `text` → `text`/`textContains`; demo `hrefSuffix` → `hrefPattern`/`hrefFromPathSegment`/`hrefContains`/`hrefSuffix`; demo `testId` → `testId` only; stable demo `id` → `id`.
- Strip unstable `id`.
- Strip `text`/`textContains` when `hrefFromPathSegment` is set.
- Strip `hrefFromPathSegment` when `hrefPattern` is set.
- Sync `waitFor` step match to the next click's match after the above.

## Playback timing (critical)

Order for step N click (N > 0):

1. If step N−1 was a click and `clickMatchLikelyNavigates(step N−1 match)` → `waitForUrlChangeAfterClick` (poll up to 20s, then `PAGE_SETTLE_MS` = 750ms).
2. Unless step N−1 was `waitFor` with the same match → `waitForScriptMatchInTab` for step N's target (poll up to 20s; instant if already in DOM).
3. Click.
4. `settleAfterStep` = `waitForTabLoad` + `IN_PAGE_SETTLE_MS` (250ms). **No URL poll here.**

Rules:

- **Href navigation** (match has `hrefFromPathSegment`, `hrefPattern`, `hrefContains`, or `hrefSuffix`): step 1 above runs before the next step. Required for multi-page hops (e.g. repo link → owner profile).
- **In-page clicks** (buttons, menus, copy): step 1 must **not** run — otherwise every step blocks ~20s waiting for a URL that never changes.
- `clickMatchLikelyNavigates` keys off href fields on the match, not tag or text alone.
- Pre-click `waitFor` resolves immediately when the element is already present; polling is only for UI still opening.

Constants (`shared/timing.ts`): `IN_PAGE_SETTLE_MS` 250, `PAGE_SETTLE_MS` 750, `TAB_LOAD_TIMEOUT_MS` / `STEP_WAIT_FOR_MS` 20_000, `MATCH_STABLE_POLLS` 3.

## Match execution

- `hrefPattern` tested against link pathname + search.
- `hrefFromPathSegment`: link pathname must equal `/${pageSegmentAt(N)}`.

## Removed — do not re-add

- Recording plan LLM + `steps`/`avoid`/`doneWhen` machinery.
- `expectNavigation` / URL-poll settle branch on every click.
- Compile prompt rules that inject playback timing (`waitFor` between steps).
- Compile dropping demo steps or merging navigation hops.
- Prompt-only guardrails without demo-grounded sanitize.

## Smoke checks (GitHub — regression traps, not product focus)

- **Multi-hop + query tab:** click scoped repo link (`hrefFromPathSegment: 0`), then tab link (`hrefPattern: "\\?tab=…"` only — no invented `testId`). Playback must navigation-wait after step 1, not after step 2.
- **In-page menu:** open dropdown/button, then copy — no 20s URL wait between steps; ~250ms settle only.
