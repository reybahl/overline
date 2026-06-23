/** Extra pause after tab load or URL change before interacting again. */
export const PAGE_SETTLE_MS = 750;

/** Max time to wait for a full tab navigation to finish. */
export const TAB_LOAD_TIMEOUT_MS = 20_000;

/** Brief window after a click to see if navigation started; avoids blocking on in-page UI. */
export const URL_CHANGE_DETECT_MS = 400;

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
