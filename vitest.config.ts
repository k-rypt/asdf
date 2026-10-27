import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/assessment/**/*.test.ts", "lib/admin/**/*.test.ts", "lib/auth/**/*.test.ts"],
  },
})
