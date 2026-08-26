import { createRequire } from "node:module";

import { defineConfig } from "vitest/config";

const desktopRequire = createRequire(new URL("./apps/desktop/package.json", import.meta.url));
const { default: vue } = await import(desktopRequire.resolve("@vitejs/plugin-vue"));

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "node",
  },
});
