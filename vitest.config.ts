import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(__dirname, "src"),
  "@ganttpro/engine": path.resolve(__dirname, "packages/engine/src/index.ts"),
};

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
        resolve: { alias },
        test: {
          name: "web",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
          environment: "node",
        },
      },
      {
        // Tests de integración: Route Handlers reales contra la base de datos ganttpro_test.
        resolve: { alias },
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          environment: "node",
          setupFiles: ["./src/test/integration-setup.ts"],
          // Los archivos comparten la base ganttpro_test: se ejecutan en serie, en un solo proceso.
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 30_000,
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
