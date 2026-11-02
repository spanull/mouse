import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", browserName: "chromium", screenshot: "only-on-failure", trace: "retain-on-failure", launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } },
  webServer: { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120000 },
});
