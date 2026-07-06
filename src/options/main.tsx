import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/options/App";
import { OverlineToaster } from "@/ui/OverlineToaster";
import "@/options/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <div className="ui-root">
      <App />
      <OverlineToaster />
    </div>
  </StrictMode>,
);
