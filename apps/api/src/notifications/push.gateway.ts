import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import type { AppEnv } from "../config/env";
import { topicMessage } from "./topic-message";

export type PushTarget = {
  deliveryId: string;
  installationId: string;
  notificationId: string;
};

export type PushPayload = {
  campaignId: string;
  title: string;
  body: string;
  deepLink: string | null;
};

export type PushResult = {
  deliveryId: string;
  ok: boolean;
  providerMessageId: string | null;
  errorCode: string | null;
  invalidInstallation: boolean;
};

export type TopicPushResult = Pick<
  PushResult,
  "ok" | "providerMessageId" | "errorCode"
>;

const FCM_APP_NAME = "alowalow-push";
const FCM_BATCH_SIZE = 500;
// FCM sends usually settle in well under a second; occasional network
// interference (seen from some deployments' networks) can otherwise leave
// the request hanging indefinitely instead of failing fast, so a batch
// past this is treated as failed rather than left to dangle forever.
const FCM_SEND_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`FCM request timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(asError(error));
      },
    );
  });
}

function errorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 160);
  }
  return "messaging/unknown-error";
}

/** The bit that actually explains *why* — `errorCode()` alone is often
 * just "messaging/unknown-error" for anything outside the SDK's known
 * FCM error codes (auth failures, disabled APIs, malformed input). */
function errorDetail(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

type CodedError = Error & { code?: string };

function asError(error: unknown): CodedError {
  if (error instanceof Error) return error;
  const normalized: CodedError = new Error(errorDetail(error));
  const code = errorCode(error);
  if (code !== "messaging/unknown-error") normalized.code = code;
  return normalized;
}

function installationFingerprint(installationId: string) {
  return createHash("sha256").update(installationId).digest("hex").slice(0, 12);
}

function isInvalidInstallation(code: string) {
  return [
    "messaging/installation-id-not-registered",
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ].includes(code);
}

@Injectable()
export class PushGateway {
  private readonly logger = new Logger(PushGateway.name);
  private app: App | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async sendTopic(
    payload: PushPayload,
    dryRun = false,
  ): Promise<TopicPushResult> {
    if (this.config.get("PUSH_PROVIDER", { infer: true }) === "console") {
      return {
        ok: true,
        providerMessageId: `console:topic:${payload.campaignId}`,
        errorCode: null,
      };
    }
    try {
      const providerMessageId = await withTimeout(
        getMessaging(this.getFcmApp()).send(topicMessage(payload), dryRun),
        FCM_SEND_TIMEOUT_MS,
      );
      return { ok: true, providerMessageId, errorCode: null };
    } catch (error) {
      const code = errorCode(error);
      this.logger.warn(`Topic campaign ${payload.campaignId} failed: ${code}`);
      return { ok: false, providerMessageId: null, errorCode: code };
    }
  }

  async send(
    payload: PushPayload,
    targets: PushTarget[],
  ): Promise<PushResult[]> {
    if (!targets.length) return [];
    if (this.config.get("PUSH_PROVIDER", { infer: true }) === "console") {
      this.logger.log(
        `Development push ${payload.campaignId} accepted for ${targets.length} installation(s)`,
      );
      return targets.map((target) => ({
        deliveryId: target.deliveryId,
        ok: true,
        providerMessageId: `console:${target.deliveryId}`,
        errorCode: null,
        invalidInstallation: false,
      }));
    }

    const messaging = getMessaging(this.getFcmApp());
    const results: PushResult[] = [];
    for (let offset = 0; offset < targets.length; offset += FCM_BATCH_SIZE) {
      const batch = targets.slice(offset, offset + FCM_BATCH_SIZE);
      const messages: Message[] = batch.map((target) => ({
        // Targeting by Firebase Installation ID (`fid`) consistently comes
        // back `messaging/installation-id-not-registered` in this project
        // even for a freshly-generated ID with a live FCM token behind it
        // — confirmed against two separate real devices. The FCM
        // registration token itself is the long-standing, universally
        // supported way to reach one device, so `installationId` here
        // actually holds a token now (see PushDeviceRegistrationService on
        // the client) despite the field's name.
        token: target.installationId,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          campaignId: payload.campaignId,
          notificationId: target.notificationId,
          ...(payload.deepLink ? { deepLink: payload.deepLink } : {}),
        },
        android: {
          priority: "high",
          notification: {
            // Each mobile app declares its own default channel in its manifest.
            sound: "default",
          },
        },
      }));

      try {
        const response = await withTimeout(
          messaging.sendEach(messages),
          FCM_SEND_TIMEOUT_MS,
        );
        response.responses.forEach((item, index) => {
          const target = batch[index];
          if (!target) return;
          const code = item.success ? null : errorCode(item.error);
          if (!item.success) {
            this.logger.warn(
              `FCM rejected installation ${installationFingerprint(target.installationId)}: ${code} — ${errorDetail(item.error)}`,
            );
          }
          results.push({
            deliveryId: target.deliveryId,
            ok: item.success,
            providerMessageId: item.success ? (item.messageId ?? null) : null,
            errorCode: code,
            invalidInstallation: code ? isInvalidInstallation(code) : false,
          });
        });
      } catch (error) {
        const code = errorCode(error);
        this.logger.error(
          `FCM batch failed for campaign ${payload.campaignId}: ${code} — ${errorDetail(error)}`,
        );
        results.push(
          ...batch.map((target) => ({
            deliveryId: target.deliveryId,
            ok: false,
            providerMessageId: null,
            errorCode: code,
            invalidInstallation: isInvalidInstallation(code),
          })),
        );
      }
    }
    return results;
  }

  private getFcmApp() {
    if (this.app) return this.app;
    const existing = getApps().find(({ name }) => name === FCM_APP_NAME);
    if (existing) {
      this.app = existing;
      return existing;
    }
    const encoded = this.config.get("FCM_SERVICE_ACCOUNT_BASE64", {
      infer: true,
    });
    const json = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    const serviceAccount: ServiceAccount = {
      projectId: json.project_id,
      clientEmail: json.client_email,
      privateKey: json.private_key,
    };
    this.app = initializeApp(
      { credential: cert(serviceAccount) },
      FCM_APP_NAME,
    );
    return this.app;
  }
}
