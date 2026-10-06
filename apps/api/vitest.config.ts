import { defineConfig } from "vitest/config";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://sacakly:sacakly@localhost:5432/sacakly_test";
const testRedisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";
const testS3Endpoint = process.env.TEST_S3_ENDPOINT ?? "http://localhost:9000";
const testOtpExpiry = new Date(
  Date.now() + 31 * 86_400_000,
).toISOString();

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: ["./test/global-setup.ts"],
    // Real PostgreSQL/Redis/MinIO suites run serially with coverage. Later
    // cases can exceed 20s on a loaded workstation or CI runner.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENVIRONMENT: "development",
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: testRedisUrl,
      JWT_ACCESS_SECRET: "test-jwt-secret-with-at-least-32-characters",
      OTP_PEPPER: "test-otp-pepper-with-at-least-32-characters",
      LONG_LIVED_TEST_OTP_ENABLED: "true",
      LONG_LIVED_TEST_OTP_PHONES: "+99365000301,+99365000302",
      LONG_LIVED_TEST_OTP_CODE: "1111",
      LONG_LIVED_TEST_OTP_EXPIRES_AT: testOtpExpiry,
      SMS_PROVIDER: "console",
      SMS_GATEWAY_DEVICE_ID: "android-test",
      SMS_GATEWAY_DEVICE_TOKEN:
        "test-android-device-token-with-at-least-32-characters",
      SMS_GATEWAY_AUTH_REQUIRED: "false",
      SMS_GATEWAY_ENCRYPTION_KEY:
        "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      CORS_ORIGINS: "http://localhost:3000",
      S3_ENDPOINT: testS3Endpoint,
      S3_ACCESS_KEY_ID: "sacakly",
      S3_SECRET_ACCESS_KEY: "sacakly-local-secret",
      S3_FORCE_PATH_STYLE: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/app-versions/**/*.ts",
        "src/accounting/**/*.ts",
        "src/inventory/**/*.ts",
        "src/loyalty/**/*.ts",
        "src/auth/**/*.ts",
        "src/branches/**/*.ts",
        "src/catalog/**/*.ts",
        "src/common/**/*.ts",
        "src/config/**/*.ts",
        "src/orders/**/*.ts",
        "src/users/**/*.ts",
        "src/media/**/*.ts",
        "src/marketplace/**/*.ts",
        "src/cafe-rewards/**/*.ts",
        "src/notifications/**/*.ts",
        "src/redis/**/*.ts",
        "src/routing/**/*.ts",
        "src/tracking/**/*.ts",
      ],
      exclude: ["src/common/auth.types.ts"],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 80,
        lines: 78,
      },
    },
  },
});
