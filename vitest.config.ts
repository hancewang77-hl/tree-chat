import path from "node:path";
import { defineConfig, defineProject } from "vitest/config";

const alias = {
  "@": path.resolve(__dirname, "."),
};

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
    },
    projects: [
      defineProject({
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: [
            "app/api/**/*.test.ts",
            "src/**/*.test.ts",
            "hooks/**/*.test.ts",
          ],
          exclude: ["**/*.test.tsx"],
          setupFiles: ["./src/test/setup/unit.ts"],
        },
      }),
      defineProject({
        resolve: { alias },
        test: {
          name: "component",
          environment: "jsdom",
          include: [
            "app/**/*.test.tsx",
            "src/components/**/*.test.tsx",
            "hooks/**/*.test.tsx",
          ],
          setupFiles: ["./src/test/setup/component.ts"],
        },
      }),
    ],
  },
});
