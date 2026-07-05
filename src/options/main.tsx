import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/options/App";
import { OptionsToaster } from "@/options/OptionsToaster";
import "@/options/index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
    <OptionsToaster />
  </StrictMode>,
);
