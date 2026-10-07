const { defineConfig, devices } = require("@playwright/test");

// Browser journeys against a live Law Suite API (in-memory store) instead of the
// disconnected public demo. Run with: npm run test:e2e:server
const apiPort = 8011;
const webPort = 4174;
const python = process.env.PYTHON || "python3";

module.exports = defineConfig({
  testDir: "./e2e-server",
  outputDir: "./test-results-server",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { outputFolder: "playwright-report-server", open: "never" }],
      ]
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${python} -m uvicorn backend.server:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: "..",
      url: `http://127.0.0.1:${apiPort}/api/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        MONGO_URL: "memory",
        LAW_SUITE_AI_MODE: "offline",
        CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
      },
    },
    {
      command: "npm run start",
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        BROWSER: "none",
        HOST: "127.0.0.1",
        PORT: String(webPort),
        REACT_APP_BACKEND_URL: `http://127.0.0.1:${apiPort}`,
      },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
