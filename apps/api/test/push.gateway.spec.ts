import type { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env";

const firebase = vi.hoisted(() => ({
  cert: vi.fn((serviceAccount: unknown) => ({ serviceAccount })),
  getApps: vi.fn(() => [] as Array<{ name: string }>),
  initializeApp: vi.fn(() => ({ name: "sacakly-push" })),
  sendEach: vi.fn(),
  send: vi.fn(),
}));

vi.mock("firebase-admin/app", () => ({
  cert: firebase.cert,
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({
    sendEach: firebase.sendEach,
    send: firebase.send,
  })),
}));

import {
  PushGateway,
  type PushTarget,
} from "../src/notifications/push.gateway";

function config(values: Partial<AppEnv>) {
  return {
    get: vi.fn((key: keyof AppEnv) => values[key]),
  } as unknown as ConfigService<AppEnv, true>;
}

const payload = {
  campaignId: "00000000-0000-4000-8000-000000000001",
  title: "Заказ готов",
  body: "Курьер скоро будет у вас",
  deepLink: "/orders/current",
};

function target(index: number): PushTarget {
  return {
    deliveryId: `delivery-${index}`,
    installationId: `installation_${index}`,
    notificationId: `notification-${index}`,
  };
}

describe("push gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.getApps.mockReturnValue([]);
  });

  it("uses a deterministic non-delivering console result locally", async () => {
    const gateway = new PushGateway(config({ PUSH_PROVIDER: "console" }));

    await expect(gateway.send(payload, [target(1)])).resolves.toEqual([
      {
        deliveryId: "delivery-1",
        ok: true,
        providerMessageId: "console:delivery-1",
        errorCode: null,
        invalidInstallation: false,
      },
    ]);
    await expect(gateway.send(payload, [])).resolves.toEqual([]);
    expect(firebase.initializeApp).not.toHaveBeenCalled();
  });

  it("initializes FCM server credentials once and sends at most 500 per batch", async () => {
    firebase.sendEach.mockImplementation(
      (messages: Array<Record<string, unknown>>) =>
        Promise.resolve({
          responses: messages.map(() => ({
            success: true,
            messageId: "fcm-message-id",
          })),
        }),
    );
    const serviceAccount = Buffer.from(
      JSON.stringify({
        project_id: "sacakly-test",
        client_email: "push@example.test",
        private_key: "private-key",
      }),
    ).toString("base64");
    const gateway = new PushGateway(
      config({
        PUSH_PROVIDER: "fcm",
        FCM_SERVICE_ACCOUNT_BASE64: serviceAccount,
      }),
    );
    const targets = Array.from({ length: 501 }, (_, index) => target(index));

    const results = await gateway.send(payload, targets);
    await gateway.send(payload, [target(999)]);

    expect(results).toHaveLength(501);
    expect(results.every(({ ok }) => ok)).toBe(true);
    expect(firebase.sendEach).toHaveBeenCalledTimes(3);
    const sendCalls = firebase.sendEach.mock.calls as unknown as Array<
      [Array<Record<string, unknown>>]
    >;
    const firstBatch = sendCalls[0]?.[0];
    expect(firstBatch).toHaveLength(500);
    expect(sendCalls[1]?.[0]).toHaveLength(1);
    expect(firebase.initializeApp).toHaveBeenCalledTimes(1);
    expect(firebase.cert).toHaveBeenCalledWith({
      projectId: "sacakly-test",
      clientEmail: "push@example.test",
      privateKey: "private-key",
    });
    expect(firstBatch?.[0]).toMatchObject({
      token: "installation_0",
      data: {
        campaignId: payload.campaignId,
        notificationId: "notification-0",
        deepLink: "/orders/current",
      },
      android: {
        priority: "high",
        notification: { sound: "default" },
      },
    });
    expect(firstBatch?.[0]).not.toHaveProperty(
      "android.notification.channelId",
    );
  });

  it("marks expired installations and converts provider failures to delivery results", async () => {
    firebase.sendEach.mockResolvedValueOnce({
      responses: [
        {
          success: false,
          error: { code: "messaging/installation-id-not-registered" },
        },
        { success: false, error: new Error("provider failure") },
      ],
    });
    const gateway = new PushGateway(
      config({
        PUSH_PROVIDER: "fcm",
        FCM_SERVICE_ACCOUNT_BASE64: Buffer.from(
          JSON.stringify({
            project_id: "test",
            client_email: "test@example.test",
            private_key: "key",
          }),
        ).toString("base64"),
      }),
    );

    await expect(
      gateway.send({ ...payload, deepLink: null }, [target(1), target(2)]),
    ).resolves.toEqual([
      {
        deliveryId: "delivery-1",
        ok: false,
        providerMessageId: null,
        errorCode: "messaging/installation-id-not-registered",
        invalidInstallation: true,
      },
      {
        deliveryId: "delivery-2",
        ok: false,
        providerMessageId: null,
        errorCode: "messaging/unknown-error",
        invalidInstallation: false,
      },
    ]);
  });

  it("fails every target in a batch when the provider request throws", async () => {
    firebase.sendEach.mockRejectedValueOnce({ code: "messaging/unavailable" });
    const gateway = new PushGateway(
      config({
        PUSH_PROVIDER: "fcm",
        FCM_SERVICE_ACCOUNT_BASE64: Buffer.from(
          JSON.stringify({
            project_id: "test",
            client_email: "test@example.test",
            private_key: "key",
          }),
        ).toString("base64"),
      }),
    );

    const results = await gateway.send(payload, [target(1), target(2)]);

    expect(results).toHaveLength(2);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ok: false,
          errorCode: "messaging/unavailable",
          invalidInstallation: false,
        }),
      ]),
    );
  });
  it("publishes once to a7-tagam without token targeting, supports iOS sound and dry-run validation", async () => {
    firebase.send.mockResolvedValue("projects/test/messages/topic-1");
    const gateway = new PushGateway(
      config({
        PUSH_PROVIDER: "fcm",
        FCM_SERVICE_ACCOUNT_BASE64: Buffer.from(
          JSON.stringify({
            project_id: "test",
            client_email: "test@example.test",
            private_key: "key",
          }),
        ).toString("base64"),
      }),
    );
    await expect(gateway.sendTopic(payload)).resolves.toEqual({
      ok: true,
      providerMessageId: "projects/test/messages/topic-1",
      errorCode: null,
    });
    expect(firebase.send).toHaveBeenLastCalledWith(
      {
        topic: "a7-tagam",
        notification: { title: payload.title, body: payload.body },
        data: { campaignId: payload.campaignId, deepLink: payload.deepLink },
        android: { priority: "high", notification: { sound: "default" } },
        apns: { payload: { aps: { sound: "default" } } },
      },
      false,
    );
    await gateway.sendTopic({ ...payload, deepLink: null }, true);
    expect(firebase.send).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { campaignId: payload.campaignId } }),
      true,
    );
    expect(firebase.sendEach).not.toHaveBeenCalled();
  });

  it("keeps console topic testing non-delivering", async () => {
    const gateway = new PushGateway(config({ PUSH_PROVIDER: "console" }));
    expect(await gateway.sendTopic(payload)).toEqual({
      ok: true,
      providerMessageId: `console:topic:${payload.campaignId}`,
      errorCode: null,
    });
    expect(firebase.send).not.toHaveBeenCalled();
  });

  it("records bounded topic errors without claiming device delivery or exposing raw provider details", async () => {
    firebase.send.mockRejectedValueOnce({
      code: "messaging/unavailable",
      message: "provider internal detail",
    });
    const gateway = new PushGateway(
      config({
        PUSH_PROVIDER: "fcm",
        FCM_SERVICE_ACCOUNT_BASE64: Buffer.from(
          JSON.stringify({
            project_id: "test",
            client_email: "test@example.test",
            private_key: "key",
          }),
        ).toString("base64"),
      }),
    );
    await expect(gateway.sendTopic(payload)).resolves.toEqual({
      ok: false,
      providerMessageId: null,
      errorCode: "messaging/unavailable",
    });
    firebase.send.mockRejectedValueOnce(new Error("private provider detail"));
    await expect(gateway.sendTopic(payload)).resolves.toEqual({
      ok: false,
      providerMessageId: null,
      errorCode: "messaging/unknown-error",
    });
  });
});
