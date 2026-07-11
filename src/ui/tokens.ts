/** Layout constants shared with overlay-host and tokens.css. */
export const UI_SHELL_WIDTH = 560;
export const UI_SHELL_MAX_HEIGHT = 480;
/** Max height for in-palette modals (matches `.ui-macro-settings` CSS). */
export const UI_MODAL_MAX_HEIGHT = 680;

/** postMessage types between the overlay iframe and content-script host. */
export const PANEL_RESIZE_MESSAGE = "PANEL_RESIZE";
export const PANEL_CLOSE_MESSAGE = "PANEL_CLOSE";
export const PANEL_MODAL_OPEN_MESSAGE = "PANEL_MODAL_OPEN";
export const PANEL_MODAL_CLOSE_MESSAGE = "PANEL_MODAL_CLOSE";
