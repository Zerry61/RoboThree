import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const rendererRoot = fileURLToPath(new URL("./src/renderer", import.meta.url));
const rendererOutput = fileURLToPath(new URL("./dist/renderer", import.meta.url));

export default defineConfig({
  root: rendererRoot,
  base: "./",
  plugins: [vue()],
  build: {
    outDir: rendererOutput,
    emptyOutDir: true,
    sourcemap: true,
  },
});
