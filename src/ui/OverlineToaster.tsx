import { Toaster } from "sonner";

export function OverlineToaster() {
  return (
    <Toaster
      theme="system"
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        className: "ol-sonner-toast",
      }}
    />
  );
}
