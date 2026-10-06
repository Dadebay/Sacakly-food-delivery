import { defineConfig, devices } from "@playwright/test";

const apiEnvironment = {
  NODE_ENV: "test",
  DEPLOYMENT_ENVIRONMENT: "development",
  PORT: "4000",
  DATABASE_URL: "postgresql://sacakly:sacakly@127.0.0.1:5432/sacakly_test",
  REDIS_URL: "redis://127.0.0.1:6379/15",
  JWT_ACCESS_SECRET: "browser-e2e-jwt-secret-with-at-least-32-characters",
  OTP_PEPPER: "browser-e2e-otp-pepper-with-at-least-32-characters",
  LONG_LIVED_TEST_OTP_ENABLED: "true",
  LONG_LIVED_TEST_OTP_PHONES: "+99365000990,+99365000991,+99362969614",
  LONG_LIVED_TEST_OTP_CODE: "1111",
  LONG_LIVED_TEST_OTP_EXPIRES_AT: new Date(
    Date.now() + 86_400_000,
  ).toISOString(),
  SMS_PROVIDER: "console",
  PUSH_PROVIDER: "console",
  CORS_ORIGINS: "http://127.0.0.1:3000,http://127.0.0.1:5174",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_ACCESS_KEY_ID: "sacakly",
  S3_SECRET_ACCESS_KEY: "sacakly-local-secret",
  S3_FORCE_PATH_STYLE: "true",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run start",
      cwd: "apps/api",
      url: "http://127.0.0.1:4000/api/v1/marketplace/cafes",
      env: apiEnvironment,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
      cwd: "apps/web",
      url: "http://127.0.0.1:3000/ru",
      env: { API_INTERNAL_URL: "http://127.0.0.1:4000" },
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
      cwd: "apps/merchant",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
