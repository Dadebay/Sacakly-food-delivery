import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4174", headless: true, trace: "retain-on-failure" },
  projects: [
    ...(["chromium", "firefox", "webkit"] as const).flatMap((browserName) => [
      { name: `${browserName}-desktop`, use: { browserName, viewport: { width: 1440, height: 900 } } },
      { name: `${browserName}-mobile`, use: { browserName, viewport: { width: 390, height: 844 }, isMobile: browserName !== "firefox" } },
    ]),
  ],
  webServer: { command: process.env.ADMIN_QA_PRODUCTION === "1" ? "npm run preview -- --host 127.0.0.1 --port 4174 --strictPort" : "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort", url: "http://127.0.0.1:4174", reuseExistingServer: false, env: { VITE_API_URL: "/api/v1" }, timeout: 60_000 },
});
