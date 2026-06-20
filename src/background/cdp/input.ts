import { sendCommand } from "@/background/cdp/driver";

/** A point in CSS pixels relative to the top-left of the layout viewport. */
export type ViewportPoint = { x: number; y: number };

/**
 * Dispatch a trusted left click at the given viewport point via CDP.
 *
 * Unlike `element.click()`, these events carry `isTrusted = true` and grant
 * transient user activation, so gesture-gated APIs (clipboard writes, file
 * pickers, popups) behave as if a real user clicked.
 */
export async function trustedClick(
  tabId: number,
  point: ViewportPoint,
): Promise<void> {
  const at = { x: point.x, y: point.y };

  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    ...at,
    type: "mouseMoved",
    buttons: 0,
  });
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    ...at,
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await sendCommand(tabId, "Input.dispatchMouseEvent", {
    ...at,
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}
