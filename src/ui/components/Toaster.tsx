import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
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
