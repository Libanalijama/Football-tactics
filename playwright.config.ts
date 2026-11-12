import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

if (!process.env.TMPDIR && existsSync("/Volumes/PortableSSD/Codex-work/tmp"))
  process.env.TMPDIR = "/Volumes/PortableSSD/Codex-work/tmp";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/._*",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:5173",
    channel: existsSync(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
      ? "chrome"
      : undefined,
    headless: true,
    viewport: { width: 1600, height: 1050 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 5173 --strictPort",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
