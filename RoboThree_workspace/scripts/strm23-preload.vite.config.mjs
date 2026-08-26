import { fileURLToPath } from "node:url";

export default {
  build: {
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./strm23-process-preload.ts", import.meta.url)),
      formats: ["cjs"],
      fileName: () => "preload.cjs",
    },
    outDir: fileURLToPath(new URL("../apps/desktop/dist/strm23", import.meta.url)),
    rollupOptions: {
      external: ["electron"],
      output: { exports: "auto" },
    },
    sourcemap: false,
  },
};
