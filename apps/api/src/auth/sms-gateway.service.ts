import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { AppEnv } from "../config/env";
import { RedisService } from "../redis/redis.service";
import {
  SmsGatewayJobStatus,
  type SmsGatewayHeartbeatResponseDto,
  type SmsGatewayJobResponseDto,
  type SmsGatewayStatusResponseDto,
} from "./sms-gateway.dto";
import { OtpService } from "./otp.service";

const KEY_PREFIX = "sacakly:sms:";
const PENDING_KEY = `${KEY_PREFIX}pending`;
const LEASES_KEY = `${KEY_PREFIX}leases`;
const FAILURES_KEY = `${KEY_PREFIX}failures`;
const JOB_PREFIX = `${KEY_PREFIX}job:`;
const DEVICE_ONLINE_TTL_SECONDS = 30;
const JOB_TTL_SECONDS = 10 * 60;
const LEASE_MILLISECONDS = 45_000;
const MAX_DELIVERY_ATTEMPTS = 3;
const POLL_INTERVAL_SECONDS = 3;

const HEARTBEAT_SCRIPT = `
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
return 1
`;

const ENQUEUE_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then
  return 0
end
redis.call("HSET", KEYS[2],
  "id", ARGV[1],
  "envelope", ARGV[2],
  "status", "PENDING",
  "createdAt", ARGV[3],
  "expiresAt", ARGV[4],
  "attempts", "0",
  "receipt", "",
  "claimedBy", "",
  "leaseUntil", "0"
)
redis.call("EXPIRE", KEYS[2], ARGV[5])
redis.call("RPUSH", KEYS[3], ARGV[1])
redis.call("EXPIRE", KEYS[3], ARGV[6])
return 1
`;

const PULL_SCRIPT = `
redis.call("SET", KEYS[3], ARGV[1], "EX", ARGV[4])

local expiredLeases = redis.call(
  "ZRANGEBYSCORE",
  KEYS[2],
  "-inf",
  ARGV[1],
  "LIMIT",
  0,
  20
)
for _, id in ipairs(expiredLeases) do
  local jobKey = ARGV[7] .. id
  local status = redis.call("HGET", jobKey, "status")
  local leaseUntil = tonumber(redis.call("HGET", jobKey, "leaseUntil") or "0")
  if status == "CLAIMED" and leaseUntil <= tonumber(ARGV[1]) then
    local attempts = tonumber(redis.call("HGET", jobKey, "attempts") or "0")
    redis.call("ZREM", KEYS[2], id)
    if attempts >= tonumber(ARGV[6]) then
      redis.call("HSET", jobKey,
        "status", "FAILED",
        "errorCode", "ACK_TIMEOUT"
      )
      redis.call("RPUSH", KEYS[4], id)
    else
      redis.call("HSET", jobKey,
        "status", "PENDING",
        "receipt", "",
        "claimedBy", "",
        "leaseUntil", "0"
      )
      redis.call("RPUSH", KEYS[1], id)
    end
  else
    redis.call("ZREM", KEYS[2], id)
  end
end

for _ = 1, 50 do
  local id = redis.call("LPOP", KEYS[1])
  if not id then
    return {}
  end
  local jobKey = ARGV[7] .. id
  local status = redis.call("HGET", jobKey, "status")
  if status == "PENDING" then
    local expiresAt = tonumber(redis.call("HGET", jobKey, "expiresAt") or "0")
    if expiresAt <= tonumber(ARGV[1]) then
      redis.call("HSET", jobKey, "status", "EXPIRED")
      redis.call("RPUSH", KEYS[4], id)
    else
      local attempts = redis.call("HINCRBY", jobKey, "attempts", 1)
      local leaseUntil = tonumber(ARGV[1]) + tonumber(ARGV[2])
      redis.call("HSET", jobKey,
        "status", "CLAIMED",
        "receipt", ARGV[5],
        "claimedBy", ARGV[3],
        "leaseUntil", tostring(leaseUntil)
      )
      redis.call("ZADD", KEYS[2], leaseUntil, id)
      return {
        id,
        redis.call("HGET", jobKey, "envelope"),
        tostring(expiresAt),
        ARGV[5],
        tostring(attempts)
      }
    end
  end
end
return {}
`;

const ACK_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 0 then
  return {-2}
end
local receipt = redis.call("HGET", KEYS[1], "receipt")
if receipt ~= ARGV[1] then
  return {-1}
end
local current = redis.call("HGET", KEYS[1], "status")
local target = ARGV[2]
if current == target then
  return {2, current}
end
if target == "SENT" then
  if current ~= "CLAIMED" then
    return {0, current}
  end
elseif target == "DELIVERED" then
  if current ~= "CLAIMED" and current ~= "SENT" then
    return {0, current}
  end
elseif target == "FAILED" then
  if current ~= "CLAIMED" and current ~= "SENT" then
    return {0, current}
  end
else
  return {0, current}
end
redis.call("HSET", KEYS[1],
  "status", target,
  "errorCode", ARGV[3],
  "updatedAt", ARGV[4]
)
redis.call("ZREM", KEYS[2], ARGV[5])
if target == "FAILED" then
  return {1, target, redis.call("HGET", KEYS[1], "envelope")}
end
return {1, target}
`;

const DRAIN_FAILURE_SCRIPT = `
local id = redis.call("LPOP", KEYS[1])
if not id then
  return {}
end
local envelope = redis.call("HGET", ARGV[1] .. id, "envelope")
if not envelope then
  return {id}
end
return {id, envelope}
`;

type SmsEnvelope = {
  phone: string;
  message: string;
  otpRequestId: string;
};

@Injectable()
export class SmsGatewayService {
  private readonly logger = new Logger(SmsGatewayService.name);
  private readonly deviceId: string;
  private readonly encryptionKey: Buffer | null;

  constructor(
    private readonly redis: RedisService,
    private readonly otp: OtpService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.deviceId = config.get("SMS_GATEWAY_DEVICE_ID", { infer: true });
    const decoded = Buffer.from(
      config.get("SMS_GATEWAY_ENCRYPTION_KEY", { infer: true }),
      "base64",
    );
    this.encryptionKey = decoded.length === 32 ? decoded : null;
  }

  async heartbeat(): Promise<SmsGatewayHeartbeatResponseDto> {
    await this.redis.eval(
      HEARTBEAT_SCRIPT,
      [this.heartbeatKey()],
      [String(Date.now()), String(DEVICE_ONLINE_TTL_SECONDS)],
    );
    return {
      deviceId: this.deviceId,
      status: "ONLINE",
      serverTime: new Date().toISOString(),
      pollIntervalSeconds: POLL_INTERVAL_SECONDS,
    };
  }

  async enqueueOtp(
    phone: string,
    code: string,
    otpRequestId: string,
    expiresInSeconds: number,
  ) {
    this.requireEncryptionKey();
    const id = randomUUID();
    const now = Date.now();
    const expiresAt = now + expiresInSeconds * 1_000;
    const envelope = this.encrypt({
      phone,
      message: `Saçakly: код входа ${code}. Никому не сообщайте код.`,
      otpRequestId,
    });
    const result = await this.redis.evalNumber(
      ENQUEUE_SCRIPT,
      [this.heartbeatKey(), this.jobKey(id), PENDING_KEY],
      [
        id,
        envelope,
        String(now),
        String(expiresAt),
        String(JOB_TTL_SECONDS),
        String(24 * 60 * 60),
      ],
    );
    if (result !== 1) {
      throw new ServiceUnavailableException(
        "Android SMS gateway is offline",
      );
    }
    return { id };
  }

  async pull(): Promise<SmsGatewayJobResponseDto | null> {
    this.requireEncryptionKey();
    const now = Date.now();
    const receipt = randomUUID();
    const raw = await this.redis.eval(
      PULL_SCRIPT,
      [
        PENDING_KEY,
        LEASES_KEY,
        this.heartbeatKey(),
        FAILURES_KEY,
      ],
      [
        String(now),
        String(LEASE_MILLISECONDS),
        this.deviceId,
        String(DEVICE_ONLINE_TTL_SECONDS),
        receipt,
        String(MAX_DELIVERY_ATTEMPTS),
        JOB_PREFIX,
      ],
    );
    await this.drainFailures();
    const values = this.array(raw);
    if (!values.length) return null;
    const [id, encrypted, expiresAt, leaseReceipt] = values;
    if (!id || !encrypted || !expiresAt || !leaseReceipt) {
      throw new ServiceUnavailableException(
        "SMS gateway queue returned an invalid job",
      );
    }
    const payload = this.decrypt(encrypted);
    return {
      id,
      phone: payload.phone,
      message: payload.message,
      expiresAt: new Date(Number(expiresAt)).toISOString(),
      receipt: leaseReceipt,
    };
  }

  async updateStatus(
    id: string,
    receipt: string,
    status: SmsGatewayJobStatus,
    errorCode = "",
  ): Promise<SmsGatewayStatusResponseDto> {
    const raw = await this.redis.eval(
      ACK_SCRIPT,
      [this.jobKey(id), LEASES_KEY],
      [receipt, status, errorCode, String(Date.now()), id],
    );
    const values = this.array(raw);
    const result = Number(values[0]);
    if (result === -2) {
      throw new NotFoundException("SMS gateway job was not found");
    }
    if (result === -1) {
      throw new ConflictException("SMS gateway receipt is invalid");
    }
    if (result === 0 || !Number.isFinite(result)) {
      throw new ConflictException(
        "SMS gateway job no longer accepts this status",
      );
    }
    if (status === SmsGatewayJobStatus.FAILED && result === 1 && values[2]) {
      await this.cancelOtp(values[2]);
    }
    return {
      accepted: true,
      idempotent: result === 2,
      status,
    };
  }

  private async drainFailures() {
    for (let index = 0; index < 20; index += 1) {
      const raw = await this.redis.eval(
        DRAIN_FAILURE_SCRIPT,
        [FAILURES_KEY],
        [JOB_PREFIX],
      );
      const values = this.array(raw);
      if (!values.length) return;
      if (values[1]) await this.cancelOtp(values[1]);
    }
  }

  private async cancelOtp(encrypted: string) {
    try {
      const payload = this.decrypt(encrypted);
      await this.otp.cancel(payload.phone, payload.otpRequestId);
    } catch {
      this.logger.error("Could not cancel a failed SMS gateway OTP job");
    }
  }

  private encrypt(payload: SmsEnvelope) {
    const key = this.requireEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  private decrypt(envelope: string): SmsEnvelope {
    const key = this.requireEncryptionKey();
    const [version, iv, tag, ciphertext, extra] = envelope.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra) {
      throw new Error("Invalid SMS envelope");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<SmsEnvelope>;
    if (
      typeof parsed.phone !== "string" ||
      typeof parsed.message !== "string" ||
      typeof parsed.otpRequestId !== "string"
    ) {
      throw new Error("Invalid SMS payload");
    }
    return parsed as SmsEnvelope;
  }

  private requireEncryptionKey() {
    if (!this.encryptionKey) {
      throw new ServiceUnavailableException(
        "Android SMS gateway encryption is not configured",
      );
    }
    return this.encryptionKey;
  }

  private heartbeatKey() {
    return `${KEY_PREFIX}device:${this.deviceId}:online`;
  }

  private jobKey(id: string) {
    return `${JOB_PREFIX}${id}`;
  }

  private array(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item));
  }
}
