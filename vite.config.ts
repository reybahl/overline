import { patchDevLogsPlugin } from "./vite-plugin-patch-logs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function generateManifest() {
  const manifest = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");
  return {
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    ...manifest,
  };
}

export default defineConfig({
  plugins: [
    react(),
    patchDevLogsPlugin(),
    webExtension({
      manifest: generateManifest,
      disableAutoLaunch: true,
      additionalInputs: [
        "src/content/index.ts",
        "src/content/dom-capture.ts",
        "src/content/shortcuts.ts",
      ],
      watchFilePaths: ["package.json", "src/manifest.json"],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
  },
});
