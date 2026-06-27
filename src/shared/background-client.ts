import type {
  BackgroundFailure,
  BackgroundMessage,
  BackgroundResponseFor,
  BackgroundSuccessFor,
} from "@/shared/types/messages";

/**
 * Typed wrapper around `chrome.runtime.sendMessage` for background RPC.
 * Chrome's API is untyped; the cast is confined to this boundary.
 */
export async function sendBackgroundMessage<T extends BackgroundMessage>(
  message: T,
): Promise<BackgroundResponseFor<T["type"]>> {
  return chrome.runtime.sendMessage(message) as Promise<
    BackgroundResponseFor<T["type"]>
  >;
}

export function isBackgroundSuccess<T extends BackgroundMessage["type"]>(
  response: BackgroundResponseFor<T>,
): response is BackgroundSuccessFor<T> {
  return response.ok;
}

export function unwrapBackgroundResponse<T extends BackgroundMessage["type"]>(
  response: BackgroundResponseFor<T>,
): BackgroundSuccessFor<T> {
  if (!response.ok) {
    throw new Error((response as BackgroundFailure).error);
  }
  return response;
}
