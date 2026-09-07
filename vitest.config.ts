import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "engine",
          root: path.resolve(__dirname, "packages/engine"),
          include: ["tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "src"),
            "@ganttpro/engine": path.resolve(__dirname, "packages/engine/src/index.ts"),
          },
        },
        test: {
          name: "web",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/engine/src/**/*.ts"],
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
