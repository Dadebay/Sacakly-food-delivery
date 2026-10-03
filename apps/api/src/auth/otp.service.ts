import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import type { AppEnv } from "../config/env";
import { RedisService } from "../redis/redis.service";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;

const ISSUE_SCRIPT = `
redis.call("HSET", KEYS[1],
  "codeHash", ARGV[1],
  "attempts", "0",
  "requestId", ARGV[2]
)
redis.call("EXPIRE", KEYS[1], ARGV[3])
return 1
`;

const VERIFY_SCRIPT = `
local stored = redis.call("HGET", KEYS[1], "codeHash")
if not stored then
  return -1
end
local attempts = tonumber(redis.call("HGET", KEYS[1], "attempts") or "0")
if attempts >= tonumber(ARGV[2]) then
  redis.call("DEL", KEYS[1])
  return -1
end
if stored ~= ARGV[1] then
  attempts = redis.call("HINCRBY", KEYS[1], "attempts", 1)
  if attempts >= tonumber(ARGV[2]) then
    redis.call("DEL", KEYS[1])
  end
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

const CANCEL_SCRIPT = `
if redis.call("HGET", KEYS[1], "requestId") ~= ARGV[1] then
  return 0
end
redis.call("DEL", KEYS[1])
return 1
`;

export type OtpVerification = "valid" | "incorrect" | "unavailable";

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: string;
  private readonly longLivedTestOtp: {
    phones: Set<string>;
    code: string;
    expiresAt: number;
  } | null;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.pepper = config.get("OTP_PEPPER", { infer: true });
    this.longLivedTestOtp = config.get("LONG_LIVED_TEST_OTP_ENABLED", {
      infer: true,
    })
      ? {
          phones: new Set(
            config
              .get("LONG_LIVED_TEST_OTP_PHONES", { infer: true })
              .split(",")
              .map((phone) => phone.trim())
              .filter(Boolean),
          ),
          code: config.get("LONG_LIVED_TEST_OTP_CODE", { infer: true }),
          expiresAt: Date.parse(
            config.get("LONG_LIVED_TEST_OTP_EXPIRES_AT", { infer: true }),
          ),
        }
      : null;
  }

  async issue(phone: string) {
    const usesLongLivedTestCode = Boolean(
      this.longLivedTestOtp &&
        this.longLivedTestOtp.phones.has(phone) &&
        this.longLivedTestOtp.expiresAt > Date.now(),
    );
    const code = usesLongLivedTestCode
      ? this.longLivedTestOtp!.code
      : String(randomInt(100_000, 1_000_000));
    const requestId = randomUUID();
    try {
      await this.redis.evalNumber(
        ISSUE_SCRIPT,
        [this.challengeKey(phone)],
        [this.codeHash(phone, code), requestId, String(OTP_TTL_SECONDS)],
      );
    } catch {
      this.logger.error("Could not create an OTP challenge");
      throw new ServiceUnavailableException(
        "Authentication service is temporarily unavailable",
      );
    }

    return {
      code,
      requestId,
      expiresInSeconds: OTP_TTL_SECONDS,
      usesLongLivedTestCode,
    };
  }

  async verify(phone: string, code: string): Promise<OtpVerification> {
    let result: number;
    try {
      result = await this.redis.evalNumber(
        VERIFY_SCRIPT,
        [this.challengeKey(phone)],
        [this.codeHash(phone, code), String(OTP_MAX_ATTEMPTS)],
      );
    } catch {
      this.logger.error("Could not verify an OTP challenge");
      throw new ServiceUnavailableException(
        "Authentication service is temporarily unavailable",
      );
    }
    if (result === 1) return "valid";
    if (result === 0) return "incorrect";
    return "unavailable";
  }

  async cancel(phone: string, requestId: string) {
    try {
      await this.redis.evalNumber(
        CANCEL_SCRIPT,
        [this.challengeKey(phone)],
        [requestId],
      );
    } catch {
      this.logger.error("Could not roll back an undelivered OTP challenge");
    }
  }

  private challengeKey(phone: string) {
    const phoneHash = createHmac("sha256", this.pepper)
      .update(phone)
      .digest("hex");
    return `alowalow:otp:challenge:${phoneHash}`;
  }

  private codeHash(phone: string, code: string) {
    return createHmac("sha256", this.pepper)
      .update(`${phone}:${code}`)
      .digest("hex");
  }
}
