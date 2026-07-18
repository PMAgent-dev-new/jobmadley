import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const dir = path.dirname(fileURLToPath(import.meta.url))

// アプリ層（src 配下）のユニット/ルートテスト用。
// scripts/lib/*.test.mts は node:test + tsx（`npm run test:catalog-feed`）で別管理なので、
// vitest の対象は src 配下の *.test.ts(x) だけに限定する。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dir, "src"),
    },
  },
})
