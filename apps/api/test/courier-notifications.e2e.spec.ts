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
  type MockInstance,
} from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { Role, type User } from "../src/generated/prisma/client";
import { NotificationsService } from "../src/notifications/notifications.service";
import { PushGateway } from "../src/notifications/push.gateway";
import type { OrderResponseDto } from "../src/orders/orders-response.dto";
import { PrismaService } from "../src/prisma/prisma.service";

describe("courier assignment notifications", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  let directPush: MockInstance<NotificationsService["sendDirectPush"]>;
  let productId: string;
  let branchId: string;
  let etrapId: number;
  let otherCourier: User;
  let otherCourierToken: string;
  const users = new Map<Role, User>();
  const tokens = new Map<Role, string>();
  const send = vi.fn<PushGateway["send"]>();
  const location = {
    address: "Courier push test",
    latitude: 37.95,
    longitude: 58.38,
  };
  const deviceToken = (id: string, suffix = "android") =>
    `courier-push:${id}:${suffix}`;
  const auth = (role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens.get(role)}`,
  });
  const user = (role: Role) => users.get(role)!;
  const body = () => ({ ...location, items: [{ productId, quantity: 1 }] });
  const register = (token: string, installationId: string) =>
    request(server)
      .put("/api/v1/notifications/devices")
      .set("Authorization", `Bearer ${token}`)
      .send({ installationId, platform: "ANDROID" });
  const settlePushes = () =>
    Promise.all(
      directPush.mock.results.map(({ value }) => value as Promise<void>),
    );
  const success: PushGateway["send"] = (_payload, targets) =>
    Promise.resolve(
      targets.map(({ deliveryId }) => ({
        deliveryId,
        ok: true,
        providerMessageId: "test-fcm",
        errorCode: null,
        invalidInstallation: false,
      })),
    );
  const assign = (
    order: OrderResponseDto,
    courierId = user(Role.COURIER).id,
    role = Role.ADMIN,
  ) =>
    request(server)
      .patch(`/api/v1/orders/${order.id}/assign-courier`)
      .set(auth(role))
      .send({ version: order.version, courierId });
  const edit = (
    order: OrderResponseDto,
    extra: Record<string, unknown> = {},
    role = Role.ADMIN,
  ) =>
    request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(auth(role))
      .send({
        ...body(),
        deliveryEtrapId: etrapId,
        version: order.version,
        ...extra,
      });

  async function readyOrder() {
    const created = (
      await request(server)
        .post("/api/v1/orders")
        .set(auth(Role.CUSTOMER))
        .send(body())
        .expect(201)
    ).body as OrderResponseDto;
    const packed = (
      await request(server)
        .patch(`/api/v1/orders/${created.id}/confirm-packing`)
        .set(auth())
        .send({
          version: created.version,
          checkedItemIds: created.items.map(({ id }) => id),
        })
        .expect(200)
    ).body as OrderResponseDto;
    await settlePushes();
    send.mockClear();
    directPush.mockClear();
    return packed;
  }

  beforeAll(async () => {
    send.mockImplementation(success);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PushGateway)
      .useValue({ send })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    // Keep one listener through concurrent requests; Supertest's per-request
    // ephemeral listener can close while another assignment is still in flight.
    await app.listen(0, "127.0.0.1");
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
    directPush = vi.spyOn(app.get(NotificationsService), "sendDirectPush");
    const jwt = app.get(JwtService);
    for (const [i, role] of Object.values(Role).entries()) {
      const created = await prisma.user.create({
        data: { phone: `+9936100940${i}`, role },
      });
      users.set(role, created);
      tokens.set(
        role,
        await jwt.signAsync({ sub: created.id, phone: created.phone, role }),
      );
    }
    otherCourier = await prisma.user.create({
      data: { phone: "+99361009408", role: Role.COURIER },
    });
    otherCourierToken = await jwt.signAsync({
      sub: otherCourier.id,
      phone: otherCourier.phone,
      role: otherCourier.role,
    });
    branchId = (
      await prisma.branch.create({
        data: { ...location, name: "Courier push branch" },
      })
    ).id;
    etrapId = (
      await prisma.etrap.create({
        data: {
          nameRu: "Courier push etrap",
          nameTk: "Courier push etrap",
          price: 15,
          isDeliveryEnabled: true,
          welayat: {
            create: {
              nameRu: "Courier push welayat",
              nameTk: "Courier push welayat",
            },
          },
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: "Courier push dish",
          slug: "courier-push-dish",
          description: "Push test",
          price: 10,
          category: { create: { name: "Courier push", slug: "courier-push" } },
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await settlePushes();
    send.mockReset().mockImplementation(success);
    directPush.mockClear();
    for (const role of [Role.CUSTOMER, Role.COURIER]) {
      await register(tokens.get(role)!, deviceToken(user(role).id)).expect(200);
    }
    await register(
      tokens.get(Role.COURIER)!,
      deviceToken(user(Role.COURIER).id, "second"),
    ).expect(200);
    await register(otherCourierToken, deviceToken(otherCourier.id)).expect(200);
  });

  afterAll(async () => {
    try {
      await settlePushes();
      directPush.mockRestore();
      await prisma.user.updateMany({
        where: {
          id: {
            in: [...users.values()].map(({ id }) => id).concat(otherCourier.id),
          },
        },
        data: { isActive: false },
      });
      await prisma.branch.update({
        where: { id: branchId },
        data: { isActive: false },
      });
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false },
      });
      await prisma.etrap.update({
        where: { id: etrapId },
        data: { isDeliveryEnabled: false },
      });
    } finally {
      await app.close();
    }
  });

  it("allows courier registration, refresh and own logout while denying other roles and cross-user deletion", async () => {
    const installationId = deviceToken(user(Role.COURIER).id);
    await register(tokens.get(Role.COURIER)!, installationId).expect(200);
    expect(await prisma.pushDevice.count({ where: { installationId } })).toBe(
      1,
    );
    await request(server)
      .put("/api/v1/notifications/devices")
      .send({ installationId, platform: "ANDROID" })
      .expect(401);
    for (const role of [
      Role.OPERATOR,
      Role.COOK,
      Role.ACCOUNTANT,
      Role.ADMIN,
    ]) {
      await register(tokens.get(role)!, installationId).expect(403);
      await request(server)
        .delete(`/api/v1/notifications/devices/${installationId}`)
        .set(auth(role))
        .expect(403);
    }
    await request(server)
      .delete(`/api/v1/notifications/devices/${installationId}`)
      .set("Authorization", `Bearer ${otherCourierToken}`)
      .expect(404);
    await register(tokens.get(Role.COURIER)!, "invalid token").expect(400);
    await request(server)
      .delete(`/api/v1/notifications/devices/${installationId}`)
      .set(auth(Role.COURIER))
      .expect(204);
    expect(
      await prisma.pushDevice.findUniqueOrThrow({ where: { installationId } }),
    ).toMatchObject({ isActive: false });
    await register(otherCourierToken, installationId).expect(200);
    expect(
      await prisma.pushDevice.findUniqueOrThrow({ where: { installationId } }),
    ).toMatchObject({ userId: otherCourier.id, isActive: true });
    await request(server)
      .delete(`/api/v1/notifications/devices/${installationId}`)
      .set(auth(Role.COURIER))
      .expect(404);
    await request(server)
      .get("/api/v1/notifications/me")
      .set(auth(Role.COURIER))
      .expect(403);
    await request(server)
      .post("/api/v1/notifications/admin/campaigns")
      .set(auth(Role.COURIER))
      .send({ title: "Forbidden", body: "Test" })
      .expect(403);
  });

  it.each([Role.OPERATOR, Role.ADMIN, Role.SUPER_ADMIN])(
    "notifies only the assigned courier's active devices after a committed %s assignment",
    async (role) => {
      const order = await readyOrder();
      const inactiveToken = deviceToken(user(Role.COURIER).id, "inactive");
      await prisma.pushDevice.create({
        data: {
          userId: user(Role.COURIER).id,
          installationId: inactiveToken,
          platform: "ANDROID",
          isActive: false,
        },
      });
      const committedStates: string[] = [];
      send.mockImplementation(async (payload, targets) => {
        committedStates.push(
          (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
            .status,
        );
        return success(payload, targets);
      });
      await assign(order, user(Role.COURIER).id, role).expect(200);
      await settlePushes();
      expect(committedStates).toEqual([
        "ASSIGNED_TO_COURIER",
        "ASSIGNED_TO_COURIER",
      ]);
      const courierCalls = send.mock.calls.filter(
        ([payload]) => payload.title === `Täze sargyt #${order.number}`,
      );
      expect(courierCalls).toHaveLength(1);
      const [payload, targets] = courierCalls[0]!;
      expect(payload.body).toBe(
        "Sargyt size berkidildi. Jikme-jiklikleri açyň.",
      );
      expect(
        targets.map(({ installationId }) => installationId).sort(),
      ).toEqual(
        [
          deviceToken(user(Role.COURIER).id),
          deviceToken(user(Role.COURIER).id, "second"),
        ].sort(),
      );
      expect(
        new Set(targets.map(({ notificationId }) => notificationId)).size,
      ).toBe(1);
      expect(directPush.mock.calls.map(([id]) => id).sort()).toEqual(
        [user(Role.CUSTOMER).id, user(Role.COURIER).id].sort(),
      );
      await prisma.pushDevice.delete({
        where: { installationId: inactiveToken },
      });
    },
  );

  it("keeps courier devices out of customer broadcasts and inbox records", async () => {
    const campaign = (
      await request(server)
        .post("/api/v1/notifications/admin/campaigns")
        .set(auth())
        .send({ title: "Customer broadcast", body: "Customer test" })
        .expect(201)
    ).body as { id: string };
    await expect
      .poll(
        async () =>
          (
            await prisma.notificationCampaign.findUniqueOrThrow({
              where: { id: campaign.id },
            })
          ).status,
        { timeout: 10_000, interval: 100 },
      )
      .toBe("SENT");
    const calls = send.mock.calls.filter(
      ([payload]) => payload.campaignId === campaign.id,
    );
    expect(calls).toHaveLength(1);
    const installations = calls[0]![1].map(
      ({ installationId }) => installationId,
    );
    expect(installations).toContain(deviceToken(user(Role.CUSTOMER).id));
    expect(installations).not.toContain(deviceToken(user(Role.COURIER).id));
    expect(installations).not.toContain(deviceToken(otherCourier.id));
    expect(
      await prisma.userNotification.count({
        where: { campaignId: campaign.id, user: { role: Role.COURIER } },
      }),
    ).toBe(0);
    expect(
      await prisma.notificationDelivery.count({
        where: {
          campaignId: campaign.id,
          device: { user: { role: Role.COURIER } },
        },
      }),
    ).toBe(0);
  });

  it("notifies the new courier on reassignment and uses distinct IDs for successive orders", async () => {
    const first = await readyOrder();
    const assigned = (await assign(first).expect(200)).body as OrderResponseDto;
    await settlePushes();
    const firstId = send.mock.calls.find(
      ([payload]) => payload.title === `Täze sargyt #${first.number}`,
    )![1][0]!.notificationId;
    const second = await readyOrder();
    await assign(second).expect(200);
    await settlePushes();
    const secondId = send.mock.calls.find(
      ([payload]) => payload.title === `Täze sargyt #${second.number}`,
    )![1][0]!.notificationId;
    expect(secondId).not.toBe(firstId);
    send.mockClear();
    directPush.mockClear();
    await assign(assigned, otherCourier.id).expect(200);
    await settlePushes();
    expect(directPush.mock.calls.map(([id]) => id)).toEqual([otherCourier.id]);
    expect(
      send.mock.calls[0]![1].map(({ installationId }) => installationId),
    ).toEqual([deviceToken(otherCourier.id)]);
    expect(
      await prisma.auditLog.count({
        where: { entityId: first.id, action: "order.courier-reassigned" },
      }),
    ).toBe(1);
  });

  it("sends no assignment push for forbidden roles, stale versions, unavailable couriers or duplicate assignments", async () => {
    const order = await readyOrder();
    for (const role of [
      Role.CUSTOMER,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      await assign(order, user(Role.COURIER).id, role).expect(403);
    }
    await assign({ ...order, version: order.version - 1 }).expect(409);
    await assign(order, user(Role.CUSTOMER).id).expect(400);
    await assign(order, randomUUID()).expect(400);
    await prisma.user.update({
      where: { id: otherCourier.id },
      data: { isActive: false },
    });
    await assign(order, otherCourier.id).expect(400);
    await register(otherCourierToken, deviceToken(otherCourier.id)).expect(401);
    await prisma.user.update({
      where: { id: otherCourier.id },
      data: { isActive: true },
    });
    expect(directPush).not.toHaveBeenCalled();
    const assigned = (await assign(order).expect(200)).body as OrderResponseDto;
    await settlePushes();
    send.mockClear();
    directPush.mockClear();
    await assign(assigned).expect(400);
    await assign(order, otherCourier.id).expect(409);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "OUT_FOR_DELIVERY" },
    });
    await assign(assigned, otherCourier.id).expect(409);
    expect(directPush).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends only the winning assignment when two requests race", async () => {
    const order = await readyOrder();
    const results = await Promise.all([
      assign(order),
      assign(order, otherCourier.id),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const winner = results.find(({ status }) => status === 200)!
      .body as OrderResponseDto;
    await settlePushes();
    const recipients = directPush.mock.calls.map(([id]) => id);
    expect(recipients.sort()).toEqual(
      [user(Role.CUSTOMER).id, winner.courierId].sort(),
    );
  });

  it("notifies on admin-edit reassignment, but stays quiet for unchanged couriers, failed edits and kitchen resets", async () => {
    const ready = await readyOrder();
    let order = (await assign(ready).expect(200)).body as OrderResponseDto;
    await settlePushes();
    directPush.mockClear();
    send.mockClear();
    await edit(order, { courierId: otherCourier.id }, Role.OPERATOR).expect(
      403,
    );
    await edit(
      { ...order, version: order.version - 1 },
      { courierId: otherCourier.id },
    ).expect(409);
    expect(directPush).not.toHaveBeenCalled();
    order = (await edit(order, { courierId: otherCourier.id }).expect(200))
      .body as OrderResponseDto;
    await settlePushes();
    expect(directPush.mock.calls.map(([id]) => id)).toEqual([otherCourier.id]);
    directPush.mockClear();
    send.mockClear();
    order = (
      await edit(order, {
        courierId: otherCourier.id,
        customerNote: "Changed note",
      }).expect(200)
    ).body as OrderResponseDto;
    expect(directPush).not.toHaveBeenCalled();
    order = (
      await edit(order, {
        courierId: user(Role.COURIER).id,
        items: [{ productId, quantity: 2 }],
      }).expect(200)
    ).body as OrderResponseDto;
    expect(order).toMatchObject({ courierId: null, status: "COOKING" });
    expect(directPush).not.toHaveBeenCalled();
  });

  it("keeps assignments successful without registered devices and when FCM fails", async () => {
    const ready = await readyOrder();
    await prisma.pushDevice.updateMany({
      where: { userId: otherCourier.id },
      data: { isActive: false },
    });
    const assigned = (await assign(ready, otherCourier.id).expect(200))
      .body as OrderResponseDto;
    await settlePushes();
    expect(
      send.mock.calls.flatMap(([, targets]) =>
        targets.map(({ installationId }) => installationId),
      ),
    ).not.toContain(deviceToken(otherCourier.id));
    send.mockClear();
    send.mockRejectedValue(new Error("Test FCM unavailable"));
    await assign(assigned).expect(200);
    await settlePushes();
    expect(
      await prisma.order.findUniqueOrThrow({ where: { id: ready.id } }),
    ).toMatchObject({
      courierId: user(Role.COURIER).id,
      status: "ASSIGNED_TO_COURIER",
    });
  });

  it("deactivates rejected tokens without disabling the courier's other devices", async () => {
    const order = await readyOrder();
    const invalid = deviceToken(user(Role.COURIER).id);
    send.mockImplementation(async (payload, targets) =>
      (await success(payload, targets)).map((result, index) =>
        targets[index]?.installationId === invalid
          ? {
              ...result,
              ok: false,
              providerMessageId: null,
              errorCode: "messaging/registration-token-not-registered",
              invalidInstallation: true,
            }
          : result,
      ),
    );
    await assign(order).expect(200);
    await settlePushes();
    expect(
      await prisma.pushDevice.findUniqueOrThrow({
        where: { installationId: invalid },
      }),
    ).toMatchObject({ isActive: false });
    expect(
      await prisma.pushDevice.findUniqueOrThrow({
        where: { installationId: deviceToken(user(Role.COURIER).id, "second") },
      }),
    ).toMatchObject({ isActive: true });
  });
});
