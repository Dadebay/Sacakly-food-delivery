import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { Role } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { NotificationsService } from "../src/notifications/notifications.service";
import {
  PushGateway,
  type TopicPushResult,
} from "../src/notifications/push.gateway";

const content = {
  title: "Новости A7-tagam",
  body: "Новое меню доступно всем",
  audience: "ALL_APP_INSTALLATIONS",
};
const campaignId = (response: { body: unknown }) =>
  (response.body as { id: string }).id;

type Worker = { dispatchPendingCampaigns(): Promise<void> };

describe("public topic campaigns", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationsService;
  let gateway: PushGateway;
  let runWorker: Worker["dispatchPendingCampaigns"];
  let server: Parameters<typeof request>[0];
  const tokens = new Map<Role, string>();
  const userIds = new Map<Role, string>();
  const auth = (role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const create = (
    body: object = { ...content, idempotencyKey: randomUUID() },
    role = Role.ADMIN,
  ) =>
    request(server)
      .post("/api/v1/notifications/admin/campaigns")
      .set(auth(role))
      .send(body);
  const retry = (id: string, role = Role.ADMIN) =>
    request(server)
      .post(`/api/v1/notifications/admin/campaigns/${id}/retry`)
      .set(auth(role));
  const list = async () => {
    const response = await request(server)
      .get("/api/v1/notifications/admin/campaigns")
      .set(auth())
      .expect(200);
    return response.body as {
      items: Array<{
        id: string;
        status: string;
        topic: string;
        intendedUserCount: number | null;
        deviceCount: number | null;
        sentCount: number | null;
        failedCount: number | null;
        topicMessageId: string | null;
        topicErrorCode: string | null;
      }>;
    };
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0, "127.0.0.1");
    server = app.getHttpServer() as Parameters<typeof request>[0];
    prisma = app.get(PrismaService);
    gateway = app.get(PushGateway);
    notifications = app.get(NotificationsService);
    notifications.onModuleDestroy();
    const worker = notifications as unknown as Worker;
    runWorker = worker.dispatchPendingCampaigns.bind(worker);
    vi.spyOn(worker, "dispatchPendingCampaigns").mockResolvedValue(undefined);
    const jwt = app.get(JwtService);
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: { phone: `+9936100830${i}`, role },
      });
      userIds.set(role, user.id);
      tokens.set(
        role,
        await jwt.signAsync({ sub: user.id, phone: user.phone, role }),
      );
    }
  });
  beforeEach(async () => {
    await prisma.notificationCampaign.deleteMany();
    await prisma.auditLog.deleteMany({
      where: { entityType: "NotificationCampaign" },
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });

  it("sends one public topic message without querying devices or creating customer inbox records", async () => {
    const send = vi.spyOn(gateway, "sendTopic");
    const devices = vi.spyOn(prisma.pushDevice, "findMany");
    const created = await create().expect(201);
    await runWorker();
    const campaign = (await list()).items[0];
    expect(campaign).toMatchObject({
      id: campaignId(created),
      topic: "a7-tagam",
      status: "SENT",
      intendedUserCount: null,
      deviceCount: null,
      sentCount: null,
      failedCount: null,
      topicMessageId: `console:topic:${campaignId(created)}`,
    });
    expect(campaign).not.toHaveProperty("dispatchToken");
    expect(campaign).not.toHaveProperty("idempotencyKey");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      campaignId: campaignId(created),
      title: content.title,
      body: content.body,
      deepLink: null,
    });
    expect(devices).not.toHaveBeenCalled();
    expect(await prisma.userNotification.count()).toBe(0);
    expect(await prisma.notificationDelivery.count()).toBe(0);
    send.mockRestore();
    devices.mockRestore();
  });

  it("allows owner administration and keeps the previous audience as the default", async () => {
    await create(
      { ...content, idempotencyKey: randomUUID() },
      Role.SUPER_ADMIN,
    ).expect(201);
    const previous = await create({
      title: "Клиентам",
      body: "История сохраняется",
    }).expect(201);
    expect(previous.body).toMatchObject({
      audience: "ALL_CUSTOMERS",
      topic: null,
      intendedUserCount: 0,
    });
  });

  it("denies anonymous and every non-administrator role, including a stale administrator JWT", async () => {
    await request(server)
      .post("/api/v1/notifications/admin/campaigns")
      .send(content)
      .expect(401);
    const created = await create().expect(201);
    for (const role of [
      Role.CUSTOMER,
      Role.COURIER,
      Role.COOK,
      Role.OPERATOR,
      Role.ACCOUNTANT,
    ]) {
      await create({ ...content, idempotencyKey: randomUUID() }, role).expect(
        403,
      );
      await request(server)
        .get("/api/v1/notifications/admin/campaigns")
        .set(auth(role))
        .expect(403);
      await retry(campaignId(created), role).expect(403);
    }
    await prisma.user.update({
      where: { id: userIds.get(Role.ADMIN) },
      data: { role: Role.CUSTOMER },
    });
    try {
      await create().expect(403);
    } finally {
      await prisma.user.update({
        where: { id: userIds.get(Role.ADMIN) },
        data: { role: Role.ADMIN },
      });
    }
  });

  it.each([
    { idempotencyKey: undefined },
    { idempotencyKey: "bad-key" },
    { audience: "hantagam" },
    { audience: null },
    { topic: "hantagam" },
    { title: "   " },
    { body: "   " },
    { deepLink: "https://example.test" },
    { deepLink: "/\\example.test" },
    { body: "🎉".repeat(490) },
  ])(
    "rejects invalid or oversized public campaign input %j",
    async (changes) => {
      await create({
        ...content,
        idempotencyKey: randomUUID(),
        ...changes,
      }).expect(400);
      expect(await prisma.notificationCampaign.count()).toBe(0);
    },
  );

  it("reuses one campaign and one send for concurrent identical creation requests", async () => {
    const body = { ...content, idempotencyKey: randomUUID() };
    const responses = await Promise.all([create(body), create(body)]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(campaignId(responses[0])).toBe(campaignId(responses[1]));
    await create({ ...body, title: "Другой текст" }).expect(409);
    const send = vi.spyOn(gateway, "sendTopic");
    await Promise.all([runWorker(), runWorker()]);
    await create(body).expect(201);
    await runWorker();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.notificationCampaign.count()).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "notification.campaign.created" },
      }),
    ).toBe(1);
    send.mockRestore();
  });

  it("records provider failure, atomically claims a retry and retains the same deduplication ID", async () => {
    const send = vi.spyOn(gateway, "sendTopic").mockResolvedValueOnce({
      ok: false,
      providerMessageId: null,
      errorCode: "messaging/unavailable",
    });
    const created = await create().expect(201);
    const id = campaignId(created);
    await runWorker();
    expect((await list()).items[0]).toMatchObject({
      status: "FAILED",
      topicErrorCode: "messaging/unavailable",
    });
    const attempts = await Promise.all([retry(id), retry(id)]);
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    await runWorker();
    expect((await list()).items[0]).toMatchObject({
      status: "SENT",
      topicErrorCode: null,
    });
    expect(send.mock.calls.map(([payload]) => payload.campaignId)).toEqual([
      id,
      id,
    ]);
    await retry(id).expect(409);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "notification.campaign.retry_requested",
          entityId: id,
        },
      }),
    ).toBe(1);
    send.mockRestore();
  });

  it("recovers stale claimed work after restart", async () => {
    const created = await create().expect(201);
    const id = campaignId(created);
    await prisma.notificationCampaign.update({
      where: { id },
      data: {
        status: "SENDING",
        dispatchToken: randomUUID(),
        updatedAt: new Date(Date.now() - 16 * 60_000),
      },
    });
    await runWorker();
    expect((await list()).items[0]).toMatchObject({ id, status: "SENT" });
  });

  it("does not let a late provider response overwrite a recovered worker result", async () => {
    let resolveSend!: (result: TopicPushResult) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const send = vi.spyOn(gateway, "sendTopic").mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        resolveSend = resolve;
      });
    });
    const created = await create().expect(201);
    const id = campaignId(created);
    const running = runWorker();
    await ready;
    await prisma.notificationCampaign.update({
      where: { id },
      data: {
        dispatchToken: randomUUID(),
        status: "SENT",
        topicMessageId: "recovered-provider-message",
      },
    });
    resolveSend({
      ok: false,
      providerMessageId: null,
      errorCode: "messaging/unavailable",
    });
    await running;
    expect((await list()).items[0]).toMatchObject({
      status: "SENT",
      topicMessageId: "recovered-provider-message",
      topicErrorCode: null,
    });
    send.mockRestore();
  });

  it("persists complete administrator content and provider acceptance in atomic audit records", async () => {
    const created = await create({
      ...content,
      idempotencyKey: randomUUID(),
      deepLink: "/catalog",
    }).expect(201);
    const id = campaignId(created);
    await runWorker();
    const audit = await prisma.auditLog.findMany({
      where: { entityId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      actorId: userIds.get(Role.ADMIN),
      metadata: { ...content, deepLink: "/catalog", topic: "a7-tagam" },
    });
    expect(audit[1]?.metadata).toMatchObject({
      status: "SENT",
      topic: "a7-tagam",
      providerMessageId: `console:topic:${id}`,
    });
    // Transaction clients use their own delegate: a nonexistent actor exercises the real FK rollback.
    await expect(
      notifications.createCampaign(
        { id: randomUUID(), role: Role.ADMIN, phone: "+99361008399" },
        {
          ...content,
          audience: "ALL_APP_INSTALLATIONS",
          idempotencyKey: randomUUID(),
        },
      ),
    ).rejects.toThrow();
    expect(await prisma.notificationCampaign.count()).toBe(1);
  });
});
