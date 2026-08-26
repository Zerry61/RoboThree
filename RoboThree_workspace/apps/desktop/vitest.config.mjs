import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  plugins: [vue()],
  test: {
    include: ["tests/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    environment: "node",
  },
});
