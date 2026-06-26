/** Extra pause after tab load or URL change before interacting again. */
export const PAGE_SETTLE_MS = 750;

/** Max time to wait for a full tab navigation to finish. */
export const TAB_LOAD_TIMEOUT_MS = 20_000;

/**
 * Window after a click to detect whether it triggered navigation. Single-page
 * apps (GitHub, etc.) often soft-navigate via history.pushState only after an
 * async fetch, which can take ~1s — a shorter window misses the URL change and
 * makes a click look inert. We short-circuit as soon as the URL changes, so the
 * only cost is for purely in-page clicks (e.g. opening a menu).
 */
export const URL_CHANGE_DETECT_MS = 1200;

/** Default timeout when waiting for an element match during playback. */
export const STEP_WAIT_FOR_MS = 20_000;

/** Default timeout for explicit waitFor steps in compiled scripts. */
export const DEFAULT_SCRIPT_WAIT_FOR_MS = 15_000;

/** Poll interval while waiting for DOM matches. */
export const MATCH_POLL_INTERVAL_MS = 100;

/** Pause after scrolling an element into view so its measured rect is stable. */
export const SCROLL_SETTLE_MS = 120;

/** Require this many consecutive successful polls before a match counts as ready. */
export const MATCH_STABLE_POLLS = 3;
