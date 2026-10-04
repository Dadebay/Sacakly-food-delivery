import { describe, expect, it } from "vitest";
import { validateEnv } from "../src/config/env";

const fcmServiceAccount = Buffer.from(
  JSON.stringify({
    project_id: "sacakly-test",
    client_email: "push@sacakly-test.iam.gserviceaccount.com",
    private_key:
      "-----BEGIN PRIVATE KEY-----\ntest-only\n-----END PRIVATE KEY-----\n",
  }),
).toString("base64");

const productionSecrets = {
  NODE_ENV: "production",
  DEPLOYMENT_ENVIRONMENT: "production",
  DATABASE_URL: "postgresql://app:secret@db.example/sacakly",
  REDIS_URL: "rediss://default:secret@redis.example:6379/0",
  JWT_ACCESS_SECRET: "j".repeat(32),
  OTP_PEPPER: "o".repeat(32),
  SMS_PROVIDER: "android_pull",
  SMS_GATEWAY_DEVICE_ID: "android-primary",
  SMS_GATEWAY_DEVICE_TOKEN: "d".repeat(48),
  SMS_GATEWAY_AUTH_REQUIRED: true,
  SMS_GATEWAY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  PUSH_PROVIDER: "fcm",
  FCM_SERVICE_ACCOUNT_BASE64: fcmServiceAccount,
  CORS_ORIGINS: "https://admin.example.com,https://app.example.com",
};

const futureTestOtpExpiry = () =>
  new Date(Date.now() + 365 * 86_400_000).toISOString();
const monthlyTestOtpExpiry = () =>
  new Date(Date.now() + 31 * 86_400_000).toISOString();

describe("security environment configuration", () => {
  it("uses the AWS credential chain in production when static keys are absent", () => {
    const env = validateEnv(productionSecrets);

    expect(env.S3_ENDPOINT).toBe("");
    expect(env.S3_ACCESS_KEY_ID).toBe("");
    expect(env.S3_SECRET_ACCESS_KEY).toBe("");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it("rejects an incomplete static credential pair", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        S3_ACCESS_KEY_ID: "access-key",
      }),
    ).toThrow(
      "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be provided together",
    );
  });

  it("does not allow production to fall back to development secrets", () => {
    expect(() =>
      validateEnv({
        NODE_ENV: "production",
        DATABASE_URL: productionSecrets.DATABASE_URL,
        CORS_ORIGINS: productionSecrets.CORS_ORIGINS,
      }),
    ).toThrow("JWT_ACCESS_SECRET");
  });

  it("requires an explicit production database", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        DATABASE_URL: "",
      }),
    ).toThrow("DATABASE_URL");
  });

  it("requires TLS Redis and the Android SMS provider in production", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        REDIS_URL: "redis://redis.example:6379/0",
      }),
    ).toThrow("rediss://");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        SMS_PROVIDER: "console",
      }),
    ).toThrow("must not be console");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        SMS_PROVIDER: "twilio",
      }),
    ).toThrow("android_pull or console");
  });

  it("supports temporary tokenless Android pull and validates the opt-in device secret", () => {
    const tokenless = validateEnv({
      ...productionSecrets,
      SMS_GATEWAY_AUTH_REQUIRED: false,
      SMS_GATEWAY_DEVICE_TOKEN: "",
    });
    expect(tokenless.SMS_GATEWAY_AUTH_REQUIRED).toBe(false);

    const android = validateEnv({
      ...productionSecrets,
      SMS_PROVIDER: "android_pull",
      SMS_GATEWAY_DEVICE_ID: "android-primary",
      SMS_GATEWAY_DEVICE_TOKEN: "d".repeat(48),
      SMS_GATEWAY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    });
    expect(android).toMatchObject({
      SMS_PROVIDER: "android_pull",
      SMS_GATEWAY_AUTH_REQUIRED: true,
    });

    expect(() =>
      validateEnv({
        ...productionSecrets,
        SMS_PROVIDER: "android_pull",
        SMS_GATEWAY_DEVICE_TOKEN: "short",
        SMS_GATEWAY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      }),
    ).toThrow("SMS_GATEWAY_DEVICE_TOKEN");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        SMS_PROVIDER: "android_pull",
        SMS_GATEWAY_DEVICE_TOKEN: "d".repeat(48),
        SMS_GATEWAY_ENCRYPTION_KEY: "not-a-32-byte-key",
      }),
    ).toThrow("SMS_GATEWAY_ENCRYPTION_KEY");
  });

  it("accepts one dedicated receipt-agent key", () => {
    expect(validateEnv(productionSecrets)).toMatchObject({
      RECEIPT_AGENT_API_TOKEN: "",
    });
    expect(() =>
      validateEnv({
        ...productionSecrets,
        RECEIPT_AGENT_API_TOKEN: "short",
      }),
    ).toThrow("at least 12 characters");
    expect(
      validateEnv({
        ...productionSecrets,
        RECEIPT_AGENT_API_TOKEN: "test-key-123",
      }),
    ).toMatchObject({ RECEIPT_AGENT_API_TOKEN: "test-key-123" });
  });

  it("allows an allowlisted test OTP in development and an acknowledged short production window", () => {
    const development = validateEnv({
      ...productionSecrets,
      DEPLOYMENT_ENVIRONMENT: "development",
      LONG_LIVED_TEST_OTP_ENABLED: true,
      LONG_LIVED_TEST_OTP_PHONES: "+99365000301,+99365000302",
      LONG_LIVED_TEST_OTP_CODE: "1111",
      LONG_LIVED_TEST_OTP_EXPIRES_AT: futureTestOtpExpiry(),
    });
    expect(development).toMatchObject({
      DEPLOYMENT_ENVIRONMENT: "development",
      LONG_LIVED_TEST_OTP_ENABLED: true,
      LONG_LIVED_TEST_OTP_PHONES: "+99365000301,+99365000302",
    });

    const production = validateEnv({
      ...productionSecrets,
      LONG_LIVED_TEST_OTP_ENABLED: true,
      LONG_LIVED_TEST_OTP_PHONES: "+99365000301,+99365000302",
      LONG_LIVED_TEST_OTP_CODE: "1111",
      LONG_LIVED_TEST_OTP_EXPIRES_AT: monthlyTestOtpExpiry(),
      LONG_LIVED_TEST_OTP_PRODUCTION_ACKNOWLEDGED: true,
    });
    expect(production).toMatchObject({
      DEPLOYMENT_ENVIRONMENT: "production",
      LONG_LIVED_TEST_OTP_ENABLED: true,
      LONG_LIVED_TEST_OTP_PRODUCTION_ACKNOWLEDGED: true,
    });

    expect(() =>
      validateEnv({
        ...productionSecrets,
        LONG_LIVED_TEST_OTP_ENABLED: true,
        LONG_LIVED_TEST_OTP_PHONES: "+99365000301,+99365000302",
        LONG_LIVED_TEST_OTP_CODE: "1111",
        LONG_LIVED_TEST_OTP_EXPIRES_AT: monthlyTestOtpExpiry(),
      }),
    ).toThrow("PRODUCTION_ACKNOWLEDGED");
  });

  it("rejects malformed or overlong test OTP exceptions", () => {
    const development = {
      ...productionSecrets,
      DEPLOYMENT_ENVIRONMENT: "development",
      LONG_LIVED_TEST_OTP_ENABLED: true,
      LONG_LIVED_TEST_OTP_PHONES: "+99365000301,+99365000302",
      LONG_LIVED_TEST_OTP_CODE: "12345",
      LONG_LIVED_TEST_OTP_EXPIRES_AT: futureTestOtpExpiry(),
    };
    expect(() => validateEnv(development)).toThrow("exactly 4 or 6 digits");
    expect(() =>
      validateEnv({
        ...development,
        LONG_LIVED_TEST_OTP_CODE: "1111",
        LONG_LIVED_TEST_OTP_PHONES: "+99365000301,+99365000301",
      }),
    ).toThrow("must not contain duplicates");
    expect(() =>
      validateEnv({
        ...development,
        LONG_LIVED_TEST_OTP_CODE: "042697",
        LONG_LIVED_TEST_OTP_EXPIRES_AT: new Date(
          Date.now() + 367 * 86_400_000,
        ).toISOString(),
      }),
    ).toThrow("no more than 366 days away");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        LONG_LIVED_TEST_OTP_ENABLED: true,
        LONG_LIVED_TEST_OTP_PHONES: "+99365000301",
        LONG_LIVED_TEST_OTP_CODE: "1111",
        LONG_LIVED_TEST_OTP_EXPIRES_AT: new Date(
          Date.now() + 33 * 86_400_000,
        ).toISOString(),
        LONG_LIVED_TEST_OTP_PRODUCTION_ACKNOWLEDGED: true,
      }),
    ).toThrow("no more than 32 days away");
  });

  it("requires a complete FCM service account in production", () => {
    expect(validateEnv(productionSecrets).PUSH_PROVIDER).toBe("fcm");

    expect(() =>
      validateEnv({
        ...productionSecrets,
        PUSH_PROVIDER: "console",
      }),
    ).toThrow("must not be console");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        FCM_SERVICE_ACCOUNT_BASE64: "not-json",
      }),
    ).toThrow("base64-encoded service account JSON");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        FCM_SERVICE_ACCOUNT_BASE64: Buffer.from(
          JSON.stringify({ project_id: "", client_email: "missing-key" }),
        ).toString("base64"),
      }),
    ).toThrow("FCM service account");
  });

  it("rejects wildcard and insecure production CORS origins", () => {
    expect(() =>
      validateEnv({
        ...productionSecrets,
        CORS_ORIGINS: "*",
      }),
    ).toThrow("explicit origins");
    expect(() =>
      validateEnv({
        ...productionSecrets,
        CORS_ORIGINS: "http://admin.example.com",
      }),
    ).toThrow("not allowed");
  });

  it("rejects invalid environment names and unsafe numeric limits", () => {
    expect(() => validateEnv({ NODE_ENV: "staging" })).toThrow("NODE_ENV");
    expect(() => validateEnv({ PORT: 0 })).toThrow("PORT");
    expect(() => validateEnv({ REFRESH_TOKEN_TTL_DAYS: 366 })).toThrow(
      "REFRESH_TOKEN_TTL_DAYS",
    );
    expect(() => validateEnv({ MAX_IMAGE_BYTES: Number.NaN })).toThrow(
      "MAX_IMAGE_BYTES",
    );
    expect(() => validateEnv({ ROUTING_TIMEOUT_MS: 100 })).toThrow(
      "ROUTING_TIMEOUT_MS",
    );
    expect(() => validateEnv({ PUSH_DISPATCH_INTERVAL_MS: 999 })).toThrow(
      "PUSH_DISPATCH_INTERVAL_MS",
    );
  });

  it("accepts a one-year rotating refresh session", () => {
    expect(
      validateEnv({
        ACCESS_TOKEN_TTL: "365d",
        REFRESH_TOKEN_TTL_DAYS: 365,
      }),
    ).toMatchObject({
      ACCESS_TOKEN_TTL: "365d",
      REFRESH_TOKEN_TTL_DAYS: 365,
    });
    expect(() => validateEnv({ ACCESS_TOKEN_TTL: "366d" })).toThrow(
      "ACCESS_TOKEN_TTL",
    );
    expect(() => validateEnv({ ACCESS_TOKEN_TTL: "one-year" })).toThrow(
      "ACCESS_TOKEN_TTL",
    );
  });

  it("accepts only a credential-free routing service origin", () => {
    expect(validateEnv({}).ROUTING_URL).toBe("http://127.0.0.1:5000");
    expect(() =>
      validateEnv({ ROUTING_URL: "http://user:secret@routing:5000" }),
    ).toThrow("ROUTING_URL");
    expect(() =>
      validateEnv({ ROUTING_URL: "http://routing:5000/route/v1" }),
    ).toThrow("ROUTING_URL");
  });

  it("validates switchable geocoding provider origins and identifying user agent", () => {
    const env = validateEnv({});
    expect(env.GEOCODING_PRIMARY_URL).toBe(
      "https://nominatim.openstreetmap.org",
    );
    expect(env.GEOCODING_FALLBACK_URL).toBe("https://photon.komoot.io");
    expect(() =>
      validateEnv({
        GEOCODING_PRIMARY_URL: "https://user:secret@geocoder.example",
      }),
    ).toThrow("GEOCODING_PRIMARY_URL");
    expect(() =>
      validateEnv({ GEOCODING_FALLBACK_URL: "file:///tmp/geocoder" }),
    ).toThrow("GEOCODING_FALLBACK_URL");
    expect(() => validateEnv({ GEOCODING_USER_AGENT: "short" })).toThrow(
      "GEOCODING_USER_AGENT",
    );
  });
});
