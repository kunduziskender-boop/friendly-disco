import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..", "backend");

/**
 * Перед локальным запуском можно поднять сервисы вручную; иначе Playwright попробует
 * стартовать бэкенд (8010) и Vite (5173). См. корневой README про виртуальное окружение Python.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "chromium-demo",
      timeout: 180_000,
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
        launchOptions: { slowMo: 400 },
        trace: "retain-on-failure",
      },
    },
  ],
  webServer: [
    {
      command: "python -m uvicorn main:app --host 127.0.0.1 --port 8010",
      cwd: backendDir,
      url: "http://127.0.0.1:8010/docs",
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
