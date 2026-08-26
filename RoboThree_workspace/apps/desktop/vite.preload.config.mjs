import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const preloadEntry = fileURLToPath(new URL("./src/preload/index.ts", import.meta.url));
const preloadOutput = fileURLToPath(new URL("./dist/preload", import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: preloadEntry,
      formats: ["cjs"],
      fileName: () => "index.cjs",
    },
    outDir: preloadOutput,
    rollupOptions: {
      external: ["electron"],
      output: {
        exports: "auto",
      },
    },
    sourcemap: true,
  },
});
