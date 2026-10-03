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
import { OrdersService } from "../src/orders/orders.service";
import { ReceiptQueueService } from "../src/orders/receipt-queue.service";
import type {
  ReceiptClaimResponseDto,
  ReceiptClaimResultDto,
  ReceiptTaskResponseDto,
} from "../src/orders/receipt-queue.dto";

const root = "/api/v1/receipt-print-tasks";
describe("durable receipt queue", () => {
  let app: INestApplication,
    prisma: PrismaService,
    server: Parameters<typeof request>[0];
  const tokens = {} as Record<Role, string>;
  let productId: string;
  let originalPrintSettings: {
    mainPrinterId: string | null;
    mainPrinterIp: string | null;
    mainCopies: number;
  } | null;
  const station = randomUUID();
  const otherStation = randomUUID();
  const auth = (role: Role = Role.ADMIN) => ({
    Authorization: `Bearer ${tokens[role]}`,
  });
  const body = () => ({
    items: [{ productId, quantity: 1 }],
    address: "Queue test address",
    latitude: 37.98,
    longitude: 58.34,
    idempotencyKey: randomUUID(),
  });
  const create = async (assisted = false, input = body()) => {
    const response = await request(server)
      .post(`/api/v1/orders${assisted ? "/assisted" : ""}`)
      .set(auth(assisted ? Role.OPERATOR : Role.CUSTOMER))
      .send({
        ...input,
        ...(assisted ? { customerPhone: "+99365000805" } : {}),
      })
      .expect(201);
    return response.body as {
      id: string;
      number: number;
      version: number;
      total: number;
    };
  };
  const claim = async (stationId = station, role: Role = Role.ADMIN) => {
    const response = await request(server)
      .post(`${root}/claim`)
      .set(auth(role))
      .send({ stationId })
      .expect(201);
    return (response.body as ReceiptClaimResultDto).task;
  };
  const outcome = (
    task: ReceiptClaimResponseDto,
    value: string,
    role: Role = Role.ADMIN,
  ) =>
    request(server).post(`${root}/${task.id}/outcome`).set(auth(role)).send({
      stationId: task.stationId,
      claimToken: task.claimToken,
      outcome: value,
    });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    originalPrintSettings = await prisma.receiptPrintSettings.findUnique({
      where: { id: "default" },
      select: { mainPrinterId: true, mainPrinterIp: true, mainCopies: true },
    });
    server = app.getHttpServer() as Parameters<typeof request>[0];
    const jwt = app.get(JwtService);
    for (const [i, role] of Object.values(Role).entries()) {
      const user = await prisma.user.create({
        data: {
          phone: `+993650008${String(i + 10).padStart(2, "0")}`,
          role,
          firstName: "Queue test",
        },
      });
      tokens[role] = await jwt.signAsync({
        sub: user.id,
        phone: user.phone,
        role,
      });
    }
    await prisma.branch.create({
      data: {
        name: "Queue test branch",
        address: "Queue test",
        latitude: 37.98,
        longitude: 58.34,
      },
    });
    const category = await prisma.category.create({
      data: {
        name: "Queue test",
        slug: "queue-test",
        receiptPrinterIp: "192.168.0.86",
      },
    });
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: "Queue dish",
        slug: "queue-dish",
        description: "Queue test",
        price: 10,
      },
    });
    productId = product.id;
  });
  beforeEach(async () => {
    // All test files share only the isolated test DB, run serially. Historical
    // tasks are terminal so each claim exercise has a deterministic backlog.
    await prisma.receiptPrintTask.updateMany({ data: { status: "DELIVERED" } });
    await prisma.receiptPrintSettings.upsert({
      where: { id: "default" },
      create: { id: "default", mainPrinterId: null, mainCopies: 2 },
      update: { mainPrinterId: null, mainPrinterIp: null, mainCopies: 2 },
    });
  });
  afterAll(async () => {
    if (originalPrintSettings) {
      await prisma.receiptPrintSettings.update({
        where: { id: "default" },
        data: originalPrintSettings,
      });
    } else {
      await prisma.receiptPrintSettings.delete({ where: { id: "default" } });
    }
    await app.close();
  });
  it("enqueues customer/API and assisted orders atomically with frozen routes", async () => {
    const order = await create();
    const phone = await create(true);
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: { in: [order.id, phone.id] } },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.status === "PENDING")).toBe(true);
    const task = await claim();
    expect(task?.orderId).toBe(order.id);
    expect(task?.plan.jobs[0].printerIp).toBe("192.168.0.86");
    await prisma.product.update({
      where: { id: productId },
      data: { receiptPrinterIp: "192.168.0.87" },
    });
    expect(
      (
        await prisma.receiptPrintTask.findUniqueOrThrow({
          where: { id: task!.id },
        })
      ).plan,
    ).toEqual(task!.plan);
    await prisma.product.update({
      where: { id: productId },
      data: { receiptPrinterIp: null },
    });
    const spy = vi
      .spyOn(app.get(OrdersService), "enqueueReceipt")
      .mockRejectedValueOnce(new Error("simulated outbox failure"));
    const before = await prisma.order.count();
    await request(server)
      .post("/api/v1/orders")
      .set(auth(Role.CUSTOMER))
      .send(body())
      .expect(500);
    spy.mockRestore();
    expect(await prisma.order.count()).toBe(before);
  });
  describe("cancellation follows kitchen delivery", () => {
    type Plan = ReceiptClaimResponseDto["plan"];
    const planOf = (task: { plan: unknown }) => task.plan as Plan;
    const tickets = (orderId: string) =>
      prisma.receiptPrintTask.findMany({
        where: { orderId },
        orderBy: { sequence: "asc" },
      });
    const edit = (
      order: { id: string; version: number },
      items: { productId: string; quantity: number }[],
    ) =>
      request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth())
        .send({
          version: order.version,
          items,
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        });
    const fixture = async () => {
      const original = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      const slow = await prisma.product.create({
        data: {
          categoryId: original.categoryId,
          name: "Slow cancellation dish",
          slug: randomUUID(),
          description: "Receipt regression",
          price: 20,
          preparationMinutes: 30,
          receiptPrinterIp: "192.168.0.87",
        },
      });
      const quick = await prisma.product.create({
        data: {
          categoryId: original.categoryId,
          name: "Quick cancellation dish",
          slug: randomUUID(),
          description: "Receipt regression",
          price: 10,
          preparationMinutes: 10,
        },
      });
      await prisma.receiptPrintSettings.update({
        where: { id: "default" },
        data: {
          mainPrinterIp: "192.168.0.100",
          mainCopies: 3,
        },
      });
      const items = [
        { productId: slow.id, quantity: 2 },
        { productId: quick.id, quantity: 2 },
      ];
      const order = await create(false, { ...body(), items });
      return { order, slow, quick, items };
    };

    it.each([false, true])(
      "full cancellation prints one main copy and only delivered kitchen lines (delivered=%s)",
      async (delivered) => {
        const { order } = await fixture();
        if (delivered) await outcome((await claim())!, "DELIVERED").expect(201);
        await request(server)
          .patch(`/api/v1/orders/${order.id}/cancel`)
          .set(auth())
          .send({
            version: order.version,
            reason: "Cancel before delayed printing",
          })
          .expect(200);
        const all = await tickets(order.id);
        expect(
          all.filter(
            (task) =>
              task.documentType === "ORDER" && task.status === "PENDING",
          ),
        ).toHaveLength(0);
        const cancellations = all.filter(
          (task) => task.documentType === "CANCELLATION",
        );
        expect(cancellations).toHaveLength(1);
        expect(planOf(cancellations[0]).mainCopies).toBe(1);
        expect(planOf(cancellations[0]).mainJob?.items).toHaveLength(2);
        expect(
          planOf(cancellations[0]).jobs.map((job) => ({
            ip: job.printerIp,
            names: job.items.map((item) => item.name),
          })),
        ).toEqual(
          delivered
            ? [{ ip: "192.168.0.87", names: ["Slow cancellation dish"] }]
            : [],
        );
        const cancellation = (await claim())!;
        await outcome(cancellation, "DELIVERED").expect(201);
        expect(await claim()).toBeNull();
      },
    );

    it.each([1, 4])(
      "updates an unprinted quantity to %i in the same ticket at the same deadline",
      async (quantity) => {
        const { order, slow, quick } = await fixture();
        await outcome((await claim())!, "DELIVERED").expect(201);
        const delayed = (await tickets(order.id)).find((task) =>
          task.eventKey.includes(":DELAY:"),
        )!;
        // Make elapsed time observable without waiting twenty minutes.
        const due = new Date(Date.now() + 5 * 60_000);
        await prisma.receiptPrintTask.update({
          where: { id: delayed.id },
          data: { nextAttemptAt: due },
        });
        await edit(order, [
          { productId: slow.id, quantity: 2 },
          { productId: quick.id, quantity },
        ]).expect(200);
        const revised = await prisma.receiptPrintTask.findUniqueOrThrow({
          where: { id: delayed.id },
        });
        expect(revised.status).toBe("PENDING");
        expect(revised.dispatchId).toBe(delayed.dispatchId);
        expect(revised.nextAttemptAt).toEqual(due);
        expect(planOf(revised).jobs[0].items[0].quantity).toBe(quantity);
        expect(
          (await tickets(order.id)).filter(
            (task) => task.documentType === "CANCELLATION",
          ),
        ).toHaveLength(0);
      },
    );

    it.each([false, true])(
      "removing a dish prints cancellation only if its kitchen ticket was delivered (%s)",
      async (delivered) => {
        const { order, slow, quick } = await fixture();
        if (delivered) await outcome((await claim())!, "DELIVERED").expect(201);
        await edit(order, [{ productId: quick.id, quantity: 2 }]).expect(200);
        const all = await tickets(order.id);
        const cancellations = all.filter(
          (task) => task.documentType === "CANCELLATION",
        );
        expect(cancellations).toHaveLength(delivered ? 1 : 0);
        if (delivered) {
          const plan = planOf(cancellations[0]);
          expect(plan.mainCopies).toBe(1);
          expect(plan.jobs).toEqual([
            expect.objectContaining({
              printerIp: "192.168.0.87",
              items: [
                expect.objectContaining({ name: slow.name, quantity: 2 }),
              ],
            }),
          ]);
        }
        expect(
          all
            .filter(
              (task) =>
                task.status === "PENDING" && task.documentType === "ORDER",
            )
            .flatMap((task) => planOf(task).jobs.flatMap((job) => job.items))
            .every((item) => item.name !== slow.name),
        ).toBe(true);
      },
    );

    it("retains printed line identity through repeated edits and cancels each removed portion once", async () => {
      const { order, slow, quick } = await fixture();
      const printed = (await claim())!;
      const slowItemId = printed.plan.jobs[0].items[0].id;
      await outcome(printed, "DELIVERED").expect(201);
      const first = await edit(order, [
        { productId: slow.id, quantity: 2 },
        { productId: quick.id, quantity: 3 },
      ]).expect(200);
      const second = await edit(
        { ...order, version: (first.body as { version: number }).version },
        [{ productId: quick.id, quantity: 3 }],
      ).expect(200);
      let cancellation = (await tickets(order.id)).find(
        (task) => task.documentType === "CANCELLATION",
      );
      expect(cancellation).toBeDefined();
      expect(planOf(cancellation!).jobs[0].items[0].id).toBe(slowItemId);
      await request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(auth())
        .send({
          version: (second.body as { version: number }).version,
          reason: "Cancel remaining unprinted food",
        })
        .expect(200);
      const all = await tickets(order.id);
      cancellation = all.find((task) => task.id === cancellation!.id);
      expect(cancellation!.status).toBe("PENDING");
      const full = all.find(
        (task) => task.eventKey === `ORDER_CANCELLED:${order.id}`,
      )!;
      expect(planOf(full).jobs).toEqual([]);
    });

    it.each([1, 4])(
      "changes a printed quantity from two to %i using only the portion difference",
      async (quantity) => {
        const { order, slow, quick } = await fixture();
        await outcome((await claim())!, "DELIVERED").expect(201);
        await edit(order, [
          { productId: slow.id, quantity },
          { productId: quick.id, quantity: 2 },
        ]).expect(200);
        const revised = (await tickets(order.id)).filter((task) =>
          task.eventKey.startsWith("ORDER_EDITED:"),
        );
        const kitchen = revised.flatMap((task) =>
          planOf(task).jobs.flatMap((job) =>
            job.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              type: task.documentType,
            })),
          ),
        );
        expect(kitchen).toEqual([
          {
            name: slow.name,
            quantity: Math.abs(quantity - 2),
            type: quantity < 2 ? "CANCELLATION" : "ORDER",
          },
        ]);
      },
    );

    it.each([false, true])(
      "cancels a late kitchen delivery without another main cancellation (recovered lease=%s)",
      async (recovered) => {
        const { order } = await fixture();
        const sending = (await claim())!;
        if (recovered)
          await prisma.receiptPrintTask.update({
            where: { id: sending.id },
            data: { status: "PENDING", lastError: "AGENT_UNAVAILABLE" },
          });
        await request(server)
          .patch(`/api/v1/orders/${order.id}/cancel`)
          .set(auth())
          .send({ version: order.version, reason: "Cancel during send" })
          .expect(200);
        await outcome(sending, "DELIVERED").expect(201);
        await outcome(sending, "DELIVERED").expect(201);
        const cancellations = (await tickets(order.id)).filter(
          (task) => task.documentType === "CANCELLATION",
        );
        expect(
          cancellations.filter((task) => planOf(task).mainJob),
        ).toHaveLength(1);
        expect(
          cancellations.flatMap((task) =>
            planOf(task).jobs.flatMap((job) =>
              job.items.map((item) => item.name),
            ),
          ),
        ).toEqual(["Slow cancellation dish"]);
      },
    );

    it.each(["retry", "expired"])(
      "does not resume an original kitchen ticket after cancellation (%s)",
      async (mode) => {
        const { order } = await fixture();
        const sending = (await claim())!;
        await request(server)
          .patch(`/api/v1/orders/${order.id}/cancel`)
          .set(auth())
          .send({
            version: order.version,
            reason: "Cancel during unavailable printer",
          })
          .expect(200);
        if (mode === "retry") await outcome(sending, "RETRY").expect(201);
        else
          await prisma.receiptPrintTask.update({
            where: { id: sending.id },
            data: { leaseExpiresAt: new Date(0) },
          });
        const next = (await claim())!;
        expect(next.plan.documentType).toBe("CANCELLATION");
        expect(next.plan.jobs).toEqual([]);
        await outcome(next, "DELIVERED").expect(201);
        expect(await claim()).toBeNull();
        await request(server)
          .post(`${root}/${sending.id}/retry`)
          .set(auth())
          .expect(409);
      },
    );

    it("keeps queued item cancellations while later edits change only waiting quantities", async () => {
      const { order, slow, quick } = await fixture();
      await outcome((await claim())!, "DELIVERED").expect(201);
      const first = await edit(order, [
        { productId: slow.id, quantity: 1 },
        { productId: quick.id, quantity: 2 },
      ]).expect(200);
      const cancellation = (await tickets(order.id)).find(
        (task) => task.documentType === "CANCELLATION",
      )!;
      await edit(
        { ...order, version: (first.body as { version: number }).version },
        [
          { productId: slow.id, quantity: 1 },
          { productId: quick.id, quantity: 4 },
        ],
      ).expect(200);
      const all = await tickets(order.id);
      expect(all.find((task) => task.id === cancellation.id)?.plan).toEqual(
        cancellation.plan,
      );
      expect(
        all.filter((task) => task.documentType === "CANCELLATION"),
      ).toHaveLength(1);
    });

    it("does not count a delivered manual reprint as extra portions", async () => {
      const { order } = await fixture();
      await outcome((await claim())!, "DELIVERED").expect(201);
      await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({ idempotencyKey: randomUUID(), mainCopies: 0 })
        .expect(201);
      await outcome((await claim())!, "DELIVERED").expect(201);
      await request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(auth())
        .send({
          version: order.version,
          reason: "Cancel after deliberate copy",
        })
        .expect(200);
      const cancellation = (await claim())!;
      expect(
        cancellation.plan.jobs.flatMap((job) =>
          job.items.map((item) => item.quantity),
        ),
      ).toEqual([2, 2]);
    });

    it("preserves legacy printed identity when old edits replaced line UUIDs", async () => {
      const { order, slow, quick } = await fixture();
      const original = (await claim())!;
      await outcome(original, "DELIVERED").expect(201);
      const oldId = original.plan.jobs[0].items[0].id;
      await prisma.orderItem.update({
        where: { id: oldId },
        data: { id: randomUUID() },
      });
      const first = await edit(order, [
        { productId: slow.id, quantity: 4 },
        { productId: quick.id, quantity: 2 },
      ]).expect(200);
      // Drain the immediate corrected main copies and the two added portions.
      for (let next = await claim(); next; next = await claim())
        await outcome(next, "DELIVERED").expect(201);
      const second = await edit(
        { ...order, version: (first.body as { version: number }).version },
        [
          { productId: slow.id, quantity: 3 },
          { productId: quick.id, quantity: 2 },
        ],
      ).expect(200);
      const cancellations = (await tickets(order.id)).filter(
        (task) => task.documentType === "CANCELLATION",
      );
      expect(cancellations).toHaveLength(1);
      expect(planOf(cancellations[0]).jobs[0].items[0].quantity).toBe(1);
      await request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(auth())
        .send({
          version: (second.body as { version: number }).version,
          reason: "Remaining portions",
        })
        .expect(200);
      const full = (await tickets(order.id)).find(
        (task) => task.eventKey === `ORDER_CANCELLED:${order.id}`,
      )!;
      expect(
        planOf(full).jobs.flatMap((job) =>
          job.items.map((item) => item.quantity),
        ),
      ).toEqual([3]);
    });

    it("manual printing preserves pending cancellation of removed printed dishes", async () => {
      const { order, quick } = await fixture();
      await outcome((await claim())!, "DELIVERED").expect(201);
      await edit(order, [{ productId: quick.id, quantity: 2 }]).expect(200);
      const cancellation = (await tickets(order.id)).find(
        (task) => task.documentType === "CANCELLATION",
      )!;
      await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({ idempotencyKey: randomUUID(), mainCopies: 1 })
        .expect(201);
      const retained = await prisma.receiptPrintTask.findUniqueOrThrow({
        where: { id: cancellation.id },
      });
      expect(retained.status).toBe("PENDING");
      expect(retained.plan).toEqual(cancellation.plan);
    });

    it("manual cancellation retains delivered quantities rather than unprinted quantity increases", async () => {
      const { order, slow, quick } = await fixture();
      await outcome((await claim())!, "DELIVERED").expect(201);
      const edited = await edit(order, [
        { productId: slow.id, quantity: 4 },
        { productId: quick.id, quantity: 2 },
      ]).expect(200);
      await request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(auth())
        .send({
          version: (edited.body as { version: number }).version,
          reason: "Cancel before extra portions print",
        })
        .expect(200);
      await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({ idempotencyKey: randomUUID() })
        .expect(201);
      const cancellation = (await claim())!;
      expect(
        cancellation.plan.jobs.flatMap((job) =>
          job.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
          })),
        ),
      ).toEqual([{ name: slow.name, quantity: 2 }]);
    });
  });
  it.each([30, 520])("schedules a ten-minute dish beside a %i-minute dish", async (minutes) => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const longDish = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Long cooking dish",
        slug: `long-${randomUUID()}`,
        description: "Thirty minutes",
        price: 20,
        preparationMinutes: minutes,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { preparationMinutes: 10 },
    });
    try {
      const order = await create(false, {
        ...body(),
        items: [
          { productId, quantity: 1 },
          { productId: longDish.id, quantity: 1 },
        ],
      });
      const catalog = await request(server)
        .get("/api/v1/catalog/products")
        .expect(200);
      expect(
        (catalog.body as { id: string; preparationMinutes: number }[]).find(
          (product) => product.id === productId,
        )?.preparationMinutes,
      ).toBe(10);
      const orderResponse = await request(server)
        .get(`/api/v1/orders/${order.id}`)
        .set(auth(Role.CUSTOMER))
        .expect(200);
      expect(
        (
          orderResponse.body as { items: { preparationMinutes: number }[] }
        ).items
          .map((item) => item.preparationMinutes)
          .sort((a, b) => a - b),
      ).toEqual([10, minutes]);
      const items = await prisma.orderItem.findMany({
        where: { orderId: order.id },
      });
      expect(
        items.map((item) => item.preparationMinutes).sort((a, b) => a - b),
      ).toEqual([10, minutes]);
      const tasks = await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
      });
      expect(tasks).toHaveLength(2);
      const immediate = tasks[0].plan as {
        jobs: { items: { id: string }[] }[];
      };
      const delayed = tasks[1].plan as {
        jobs: { items: { id: string }[] }[];
        mainJob: unknown;
        mainCopies: number;
      };
      expect(
        immediate.jobs.flatMap((job) => job.items.map((item) => item.id)),
      ).toEqual([items.find((item) => item.productId === longDish.id)!.id]);
      expect(
        delayed.jobs.flatMap((job) => job.items.map((item) => item.id)),
      ).toEqual([items.find((item) => item.productId === productId)!.id]);
      expect(delayed.mainJob).toBeNull();
      expect(delayed.mainCopies).toBe(1);
      expect(
        tasks[1].nextAttemptAt.getTime() - tasks[0].createdAt.getTime(),
      ).toBeGreaterThan((minutes - 11) * 60_000);
      expect(
        tasks[1].nextAttemptAt.getTime() - tasks[0].createdAt.getTime(),
      ).toBeLessThan((minutes - 9) * 60_000);
      await request(server)
        .post(`${root}/${tasks[1].id}/retry`)
        .set(auth())
        .expect(409);
      const claimed = (await claim())!;
      expect(claimed.id).toBe(tasks[0].id);
      await outcome(claimed, "DELIVERED").expect(201);
      expect(await claim()).toBeNull();
      await request(server)
        .patch(`/api/v1/orders/${order.id}/cancel`)
        .set(auth())
        .send({ version: order.version, reason: "Stop delayed kitchen copy" })
        .expect(200);
      expect(
        (
          await prisma.receiptPrintTask.findUniqueOrThrow({
            where: { id: tasks[1].id },
          })
        ).status,
      ).toBe("CANCELLED");
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: minutes },
      });
      const equalOrder = await create(false, {
        ...body(),
        items: [
          { productId, quantity: 1 },
          { productId: longDish.id, quantity: 1 },
        ],
      });
      expect(
        await prisma.receiptPrintTask.count({
          where: { orderId: equalOrder.id },
        }),
      ).toBe(1);
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: original.preparationMinutes },
      });
    }
  });

  it("cancels the removed dish's delayed ticket when an administrator edits food", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const longDish = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Thirty minute edit dish",
        slug: `edit-long-${randomUUID()}`,
        description: "Printed before the edit",
        price: 20,
        preparationMinutes: 30,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { preparationMinutes: 10 },
    });
    try {
      const order = await create(false, {
        ...body(),
        items: [
          { productId, quantity: 1 },
          { productId: longDish.id, quantity: 1 },
        ],
      });
      const tasks = await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
      });
      expect(tasks).toHaveLength(2);
      const printed = (await claim())!;
      expect(printed.id).toBe(tasks[0]!.id);
      await outcome(printed, "DELIVERED").expect(201);
      await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: order.version,
          items: [{ productId: longDish.id, quantity: 1 }],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      const delayed = await prisma.receiptPrintTask.findUniqueOrThrow({
        where: { id: tasks[1]!.id },
      });
      expect(delayed.status).toBe("CANCELLED");
      expect(await claim()).toBeNull();
      expect(
        await prisma.auditLog.findFirst({
          where: {
            action: "receipt.cancelled_after_order_edit",
            entityId: delayed.id,
          },
        }),
      ).toBeTruthy();
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: original.preparationMinutes },
      });
    }
  });

  it("moves a retained kitchen ticket earlier when the longest dish is removed", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const longDish = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Removed long dish",
        slug: `removed-long-${randomUUID()}`,
        description: "Timing recalculation test",
        price: 20,
        preparationMinutes: 30,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { preparationMinutes: 10 },
    });
    try {
      const order = await create(false, {
        ...body(),
        items: [
          { productId, quantity: 1 },
          { productId: longDish.id, quantity: 1 },
        ],
      });
      const tasks = await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
      });
      const immediate = (await claim())!;
      expect(immediate.id).toBe(tasks[0]!.id);
      await outcome(immediate, "DELIVERED").expect(201);
      await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: order.version,
          items: [{ productId, quantity: 1 }],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      const retained = await prisma.receiptPrintTask.findUniqueOrThrow({
        where: { id: tasks[1]!.id },
      });
      expect(retained.status).toBe("PENDING");
      expect(retained.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect((await claim())?.id).toBe(retained.id);
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: original.preparationMinutes },
      });
    }
  });

  it("postpones an unprinted short dish when a new long dish is added", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const firstLong = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "First long dish",
        slug: `first-long-${randomUUID()}`,
        description: "Timing edit test",
        price: 20,
        preparationMinutes: 30,
      },
    });
    const newLong = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "New long dish",
        slug: `new-long-${randomUUID()}`,
        description: "Timing edit test",
        price: 20,
        preparationMinutes: 30,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { preparationMinutes: 10 },
    });
    try {
      const order = await create(false, {
        ...body(),
        items: [
          { productId, quantity: 1 },
          { productId: firstLong.id, quantity: 1 },
        ],
      });
      const initial = await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
      });
      const printed = (await claim())!;
      await outcome(printed, "DELIVERED").expect(201);
      await prisma.order.update({
        where: { id: order.id },
        data: { createdAt: new Date(Date.now() - 15 * 60_000) },
      });
      await prisma.receiptPrintTask.update({
        where: { id: initial[1]!.id },
        data: { nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
      });
      await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: order.version,
          items: [
            { productId, quantity: 1 },
            { productId: firstLong.id, quantity: 1 },
            { productId: newLong.id, quantity: 1 },
          ],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      const shortTask = await prisma.receiptPrintTask.findUniqueOrThrow({
        where: { id: initial[1]!.id },
      });
      expect(shortTask.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(
        19 * 60_000,
      );
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: original.preparationMinutes },
      });
    }
  });

  it("postpones a kitchen ticket from an earlier edit after another long dish is added", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const shortDish = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Short dish from first edit",
        slug: `edited-short-${randomUUID()}`,
        description: "Second timing edit test",
        price: 20,
        preparationMinutes: 10,
      },
    });
    const newLong = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Long dish from second edit",
        slug: `edited-long-${randomUUID()}`,
        description: "Second timing edit test",
        price: 20,
        preparationMinutes: 30,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { preparationMinutes: 30 },
    });
    try {
      const order = await create();
      const first = (await claim())!;
      await outcome(first, "DELIVERED").expect(201);
      const firstEdit = await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: order.version,
          items: [
            { productId, quantity: 1 },
            { productId: shortDish.id, quantity: 1 },
          ],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      const delayed = await prisma.receiptPrintTask.findFirstOrThrow({
        where: {
          orderId: order.id,
          eventKey: { contains: ":KITCHEN:DELAY:20" },
        },
      });
      await prisma.receiptPrintTask.update({
        where: { id: delayed.id },
        data: { nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
      });
      await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: (firstEdit.body as { version: number }).version,
          items: [
            { productId, quantity: 1 },
            { productId: shortDish.id, quantity: 1 },
            { productId: newLong.id, quantity: 1 },
          ],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      const retained = await prisma.receiptPrintTask.findUniqueOrThrow({
        where: { id: delayed.id },
      });
      expect(retained.status).toBe("PENDING");
      expect(retained.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(
        19 * 60_000,
      );
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: original.preparationMinutes },
      });
    }
  });

  it.each([
    { action: "cancel", status: "PENDING" },
    { action: "cancel", status: "FAILED" },
    { action: "reprint", status: "PENDING" },
    { action: "reprint", status: "FAILED" },
    { action: "reprint", status: "UNCERTAIN" },
  ] as const)(
    "$action supersedes $status receipts created by an order edit",
    async ({ action, status }) => {
      const original = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
      });
      const shortDish = await prisma.product.create({
        data: {
          categoryId: original.categoryId,
          name: "Edited ten-minute dish",
          slug: `superseded-edit-${randomUUID()}`,
          description: "Delayed edit regression",
          price: 20,
          preparationMinutes: 10,
        },
      });
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: 30 },
      });
      await prisma.receiptPrintSettings.update({
        where: { id: "default" },
        data: { mainPrinterIp: "192.168.0.87", mainCopies: 2 },
      });
      try {
        const order = await create();
        const delivered = (await claim())!;
        await outcome(delivered, "DELIVERED").expect(201);
        const edited = await request(server)
          .patch(`/api/v1/orders/${order.id}/admin-edit`)
          .set(auth())
          .send({
            version: order.version,
            items: [
              { productId, quantity: 1 },
              { productId: shortDish.id, quantity: 1 },
            ],
            deliveryEtrapId: 25,
            address: "Queue test address",
            latitude: 37.98,
            longitude: 58.34,
          })
          .expect(200);
        const revised = await prisma.receiptPrintTask.findMany({
          where: { orderId: order.id, eventKey: { startsWith: "ORDER_EDITED:" } },
        });
        expect(revised).toHaveLength(2);
        expect(
          revised.some((task) => task.eventKey.endsWith(":MAIN_COPY:1")),
        ).toBe(true);
        expect(
          revised.some(
            (task) =>
              task.eventKey.endsWith(":KITCHEN:DELAY:20") &&
              task.nextAttemptAt.getTime() > Date.now() + 19 * 60_000,
          ),
        ).toBe(true);
        const revisedIds = revised.map((task) => task.id);
        await prisma.receiptPrintTask.updateMany({
          where: { id: { in: revisedIds } },
          data: { status },
        });
        if (action === "cancel") {
          await request(server)
            .patch(`/api/v1/orders/${order.id}/cancel`)
            .set(auth())
            .send({
              version: (edited.body as { version: number }).version,
              reason: "Cancel edited food",
            })
            .expect(200);
        } else {
          const selection = { idempotencyKey: randomUUID() };
          const first = await request(server)
            .post(`${root}/orders/${order.id}/reprint`)
            .set(auth())
            .send(selection)
            .expect(201);
          const replay = await request(server)
            .post(`${root}/orders/${order.id}/reprint`)
            .set(auth())
            .send(selection)
            .expect(201);
          expect((replay.body as ReceiptTaskResponseDto).id).toBe(
            (first.body as ReceiptTaskResponseDto).id,
          );
          expect(
            await prisma.auditLog.findFirst({
              where: {
                entityId: (first.body as ReceiptTaskResponseDto).id,
                action: "receipt.reprint_requested",
              },
            }),
          ).toMatchObject({
            metadata: { cancelledAutomaticTasks: revised.length },
          });
        }
        const superseded = await prisma.receiptPrintTask.findMany({
          where: { id: { in: revisedIds } },
        });
        expect(superseded).toHaveLength(revisedIds.length);
        for (const task of superseded) expect(task.status).toBe("CANCELLED");
        expect(
          await prisma.receiptPrintTask.findUniqueOrThrow({
            where: { id: delivered.id },
          }),
        ).toMatchObject({ status: "DELIVERED" });
        // Advance the delayed tasks' eligibility without waiting twenty minutes.
        await prisma.receiptPrintTask.updateMany({
          where: { id: { in: revisedIds } },
          data: { nextAttemptAt: new Date(0) },
        });
        for (let copy = 0; copy < (action === "cancel" ? 1 : 2); copy += 1) {
          const next = (await claim())!;
          expect(next).not.toBeNull();
          expect(revisedIds).not.toContain(next.id);
          expect(next.plan.documentType).toBe(
            action === "cancel" ? "CANCELLATION" : "ORDER",
          );
          await outcome(next, "DELIVERED").expect(201);
        }
        expect(await claim()).toBeNull();
      } finally {
        await prisma.product.update({
          where: { id: productId },
          data: { preparationMinutes: original.preparationMinutes },
        });
      }
    },
  );

  it("cancels a delayed dish removed on a later edit after line IDs change", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const shortDish = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Short dish removed later",
        slug: `later-removed-short-${randomUUID()}`,
        description: "Repeated edit cancellation test",
        price: 20,
        preparationMinutes: 10,
      },
    });
    const anotherLong = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Another long dish",
        slug: `later-added-long-${randomUUID()}`,
        description: "Repeated edit cancellation test",
        price: 20,
        preparationMinutes: 30,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { preparationMinutes: 30 },
    });
    try {
      const order = await create(false, {
        ...body(),
        items: [
          { productId, quantity: 1 },
          { productId: shortDish.id, quantity: 1 },
        ],
      });
      const first = (await claim())!;
      await outcome(first, "DELIVERED").expect(201);
      const delayed = await prisma.receiptPrintTask.findFirstOrThrow({
        where: { orderId: order.id, status: "PENDING" },
      });
      const firstEdit = await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: order.version,
          items: [
            { productId, quantity: 1 },
            { productId: shortDish.id, quantity: 1 },
            { productId: anotherLong.id, quantity: 1 },
          ],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      const secondEdit = await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: (firstEdit.body as { version: number }).version,
          items: [
            { productId, quantity: 1 },
            { productId: anotherLong.id, quantity: 1 },
          ],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      expect((secondEdit.body as { items: unknown[] }).items).toHaveLength(2);
      expect(
        (
          await prisma.receiptPrintTask.findUniqueOrThrow({
            where: { id: delayed.id },
          })
        ).status,
      ).toBe("CANCELLED");
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: original.preparationMinutes },
      });
    }
  });

  it("queues only newly added food after a delivered kitchen ticket", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const added = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Added dish",
        slug: `added-${randomUUID()}`,
        description: "Revised kitchen print test",
        price: 20,
        preparationMinutes: 30,
      },
    });
    const order = await create();
    const printed = (await claim())!;
    await outcome(printed, "DELIVERED").expect(201);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(auth(Role.ADMIN))
      .send({
        version: order.version,
        items: [
          { productId, quantity: 1 },
          { productId: added.id, quantity: 1 },
        ],
        deliveryEtrapId: 25,
        address: "Queue test address",
        latitude: 37.98,
        longitude: 58.34,
      })
      .expect(200);
    const revision = await prisma.receiptPrintTask.findFirstOrThrow({
      where: { orderId: order.id, eventKey: { startsWith: "ORDER_EDITED:" } },
    });
    expect(revision.status).toBe("PENDING");
    const plan = revision.plan as {
      mainJob: unknown;
      jobs: { items: { name: string }[] }[];
    };
    expect(plan.mainJob).toBeNull();
    expect(
      plan.jobs.flatMap((job) => job.items.map((item) => item.name)),
    ).toEqual(["Added dish"]);
    expect((await claim())?.id).toBe(revision.id);
  });

  it("keeps another dish in the same delayed ticket when one is removed", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const otherShort = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Other short dish",
        slug: `other-short-${randomUUID()}`,
        description: "Mixed delayed ticket test",
        price: 15,
        preparationMinutes: 10,
      },
    });
    const longDish = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Other long dish",
        slug: `other-long-${randomUUID()}`,
        description: "Mixed delayed ticket test",
        price: 20,
        preparationMinutes: 30,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { preparationMinutes: 10 },
    });
    try {
      const order = await create(false, {
        ...body(),
        items: [
          { productId, quantity: 1 },
          { productId: otherShort.id, quantity: 1 },
          { productId: longDish.id, quantity: 1 },
        ],
      });
      const tasks = await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
      });
      expect(tasks).toHaveLength(2);
      await request(server)
        .patch(`/api/v1/orders/${order.id}/admin-edit`)
        .set(auth(Role.ADMIN))
        .send({
          version: order.version,
          items: [
            { productId: otherShort.id, quantity: 1 },
            { productId: longDish.id, quantity: 1 },
          ],
          deliveryEtrapId: 25,
          address: "Queue test address",
          latitude: 37.98,
          longitude: 58.34,
        })
        .expect(200);
      const delayed = await prisma.receiptPrintTask.findUniqueOrThrow({
        where: { id: tasks[1]!.id },
      });
      expect(delayed.status).toBe("PENDING");
      const plan = delayed.plan as { jobs: { items: { name: string }[] }[] };
      expect(
        plan.jobs.flatMap((job) => job.items.map((item) => item.name)),
      ).toEqual(["Other short dish"]);
      expect(
        await prisma.auditLog.count({
          where: {
            action: "receipt.adjusted_after_order_edit",
            entityId: delayed.id,
          },
        }),
      ).toBe(1);
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { preparationMinutes: original.preparationMinutes },
      });
    }
  });

  it("rejects an item edit while its receipt is being sent", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const second = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Processing edit dish",
        slug: `processing-edit-${randomUUID()}`,
        description: "Processing conflict test",
        price: 20,
      },
    });
    const order = await create(false, {
      ...body(),
      items: [
        { productId, quantity: 1 },
        { productId: second.id, quantity: 1 },
      ],
    });
    const processing = (await claim())!;
    await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(auth(Role.ADMIN))
      .send({
        version: order.version,
        items: [{ productId: second.id, quantity: 1 }],
        deliveryEtrapId: 25,
        address: "Queue test address",
        latitude: 37.98,
        longitude: 58.34,
      })
      .expect(409);
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(
      2,
    );
    expect(
      (
        await prisma.receiptPrintTask.findUniqueOrThrow({
          where: { id: processing.id },
        })
      ).status,
    ).toBe("PROCESSING");
    await outcome(processing, "DELIVERED").expect(201);
  });

  it("rejects an item edit while a receipt has an uncertain print outcome", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const second = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Uncertain edit dish",
        slug: `uncertain-edit-${randomUUID()}`,
        description: "Uncertain print conflict test",
        price: 20,
      },
    });
    const order = await create(false, {
      ...body(),
      items: [
        { productId, quantity: 1 },
        { productId: second.id, quantity: 1 },
      ],
    });
    const printing = (await claim())!;
    await outcome(printing, "UNCERTAIN").expect(201);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/admin-edit`)
      .set(auth(Role.ADMIN))
      .send({
        version: order.version,
        items: [{ productId: second.id, quantity: 1 }],
        deliveryEtrapId: 25,
        address: "Queue test address",
        latitude: 37.98,
        longitude: 58.34,
      })
      .expect(409);
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBe(
      2,
    );
    expect(
      (
        await prisma.receiptPrintTask.findUniqueOrThrow({
          where: { id: printing.id },
        })
      ).status,
    ).toBe("UNCERTAIN");
    expect(
      await prisma.receiptPrintTask.count({
        where: {
          orderId: order.id,
          eventKey: { startsWith: "ORDER_EDITED:" },
        },
      }),
    ).toBe(0);
  });

  it("lets an administrator cancel only a waiting receipt task and audits it", async () => {
    const order = await create();
    const task = await prisma.receiptPrintTask.findFirstOrThrow({
      where: { orderId: order.id },
    });
    await prisma.receiptPrintTask.update({
      where: { id: task.id },
      data: { nextAttemptAt: new Date(Date.now() + 20 * 60_000) },
    });
    const listed = await request(server)
      .get(root)
      .set(auth(Role.ADMIN))
      .expect(200);
    expect(
      (
        listed.body as { items: { id: string; itemNames: string[] }[] }
      ).items.find((item) => item.id === task.id)?.itemNames,
    ).toContain("Queue dish");
    const path = `${root}/${task.id}/cancel`;
    await request(server).post(path).set(auth(Role.CUSTOMER)).expect(403);
    await request(server).post(path).set(auth(Role.OPERATOR)).expect(403);
    const response = await request(server)
      .post(path)
      .set(auth(Role.ADMIN))
      .expect(201);
    expect(response.body).toMatchObject({ id: task.id, status: "CANCELLED" });
    await request(server).post(path).set(auth(Role.ADMIN)).expect(409);
    expect(await claim()).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          action: "receipt.manually_cancelled",
          entityId: task.id,
        },
      }),
    ).toBe(1);
    const deliveredOrder = await create();
    const processing = (await claim())!;
    expect(processing.orderId).toBe(deliveredOrder.id);
    await request(server)
      .post(`${root}/${processing.id}/cancel`)
      .set(auth())
      .expect(409);
    await outcome(processing, "DELIVERED").expect(201);
    await request(server)
      .post(`${root}/${processing.id}/cancel`)
      .set(auth())
      .expect(409);
    const superAdminOrder = await create();
    const superAdminTask = await prisma.receiptPrintTask.findFirstOrThrow({
      where: { orderId: superAdminOrder.id },
    });
    await request(server)
      .post(`${root}/${superAdminTask.id}/cancel`)
      .set(auth(Role.SUPER_ADMIN))
      .expect(201);
  });

  it.each([0, 1, 3])("manual mainCopies=%i controls paper copies without changing defaults", async (mainCopies) => {
    await prisma.receiptPrintSettings.update({ where: { id: "default" }, data: { mainPrinterIp: "192.168.0.87", mainCopies: 2 } });
    const order = await create();
    const input = { idempotencyKey: randomUUID(), mainCopies };
    const first = await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth()).send(input).expect(201);
    const retry = await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth()).send(input).expect(201);
    expect((retry.body as ReceiptTaskResponseDto).id).toBe((first.body as ReceiptTaskResponseDto).id);
    await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth()).send({ ...input, mainCopies: mainCopies === 0 ? 1 : 0 }).expect(409);
    const tasks = await prisma.receiptPrintTask.findMany({ where: { orderId: order.id } });
    expect(tasks.filter((task) => task.eventKey.startsWith("ORDER_CREATED:")).every((task) => task.status === "CANCELLED")).toBe(true);
    const plans = tasks.filter((task) => task.eventKey.startsWith("MANUAL:")).map((task) => task.plan as { mainJob: unknown; jobs: unknown[] });
    expect(plans.filter((plan) => plan.mainJob)).toHaveLength(mainCopies);
    expect(plans.flatMap((plan) => plan.jobs)).toHaveLength(1);
    expect((await prisma.receiptPrintSettings.findUniqueOrThrow({ where: { id: "default" } })).mainCopies).toBe(2);
    let delivered = 0;
    for (let task = await claim(); task; task = await claim()) {
      expect(task.orderId).toBe(order.id);
      if (mainCopies === 0) expect(task.plan.mainJob).toBeNull();
      await outcome(task, "DELIVERED").expect(201);
      delivered++;
    }
    expect(delivered).toBe(Math.max(1, mainCopies));
  });

  it.each([-1, 4, 1.5, null, "1"])("rejects invalid manual mainCopies %s before cancelling pending checks", async (mainCopies) => {
    const order = await create();
    await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth()).send({ idempotencyKey: randomUUID(), mainCopies }).expect(400);
    expect(await prisma.receiptPrintTask.count({ where: { orderId: order.id, status: "PENDING" } })).toBe(1);
  });

  it("restricts manual copy overrides and requires a configured main printer", async () => {
    const order = await create();
    await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth(Role.OPERATOR)).send({ idempotencyKey: randomUUID(), mainCopies: 0 }).expect(403);
    await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth()).send({ idempotencyKey: randomUUID(), mainCopies: 1 }).expect(409);
    expect(await prisma.receiptPrintTask.count({ where: { orderId: order.id, status: "PENDING" } })).toBe(1);
  });

  it("does not cancel queued checks when main-only dishes have main printing disabled", async () => {
    await prisma.receiptPrintSettings.update({ where: { id: "default" }, data: { mainPrinterIp: "192.168.0.87" } });
    const order = await create();
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth()).send({ idempotencyKey: randomUUID(), mainCopies: 0, itemRoutes: [{ itemId: item.id, printerId: null }] }).expect(400);
    expect(await prisma.receiptPrintTask.count({ where: { orderId: order.id, status: "CANCELLED" } })).toBe(0);
    expect(await prisma.receiptPrintTask.count({ where: { orderId: order.id, eventKey: { startsWith: "MANUAL:" } } })).toBe(0);
  });

  it("rejects mainCopies=0 when a selected dish has no kitchen destination", async () => {
    await prisma.receiptPrintSettings.update({ where: { id: "default" }, data: { mainPrinterIp: "192.168.0.87" } });
    const product = await prisma.product.create({ data: { name: "Unassigned dish", slug: randomUUID(), description: "No printer", price: 10, category: { create: { name: "Unassigned", slug: randomUUID() } } } });
    const order = await create(false, { ...body(), items: [{ productId: product.id, quantity: 1 }] });
    await request(server).post(`${root}/orders/${order.id}/reprint`).set(auth()).send({ idempotencyKey: randomUUID(), mainCopies: 0 }).expect(400);
    expect(await prisma.receiptPrintTask.count({ where: { orderId: order.id, status: "PENDING" } })).toBe(2);
    expect(await prisma.receiptPrintTask.count({ where: { orderId: order.id, eventKey: { startsWith: "MANUAL:" } } })).toBe(0);
  });

  it("manual routing cancels queued automatic checks and is idempotent", async () => {
    const order = await create();
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const printer = await prisma.receiptPrinter.findFirstOrThrow({
      where: { isActive: true },
    });
    const body = {
      idempotencyKey: randomUUID(),
      itemRoutes: [{ itemId: item.id, printerId: printer.id }],
    };
    await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth(Role.OPERATOR))
      .send(body)
      .expect(403);
    const first = await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send(body)
      .expect(201);
    const again = await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send(body)
      .expect(201);
    expect((again.body as ReceiptTaskResponseDto).id).toBe(
      (first.body as ReceiptTaskResponseDto).id,
    );
    await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send({
        idempotencyKey: body.idempotencyKey,
        itemRoutes: [{ itemId: item.id, printerId: null }],
      })
      .expect(409);
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
    });
    expect(tasks.map((task) => task.status)).toEqual(["CANCELLED", "PENDING"]);
    const plan = tasks[1].plan as {
      jobs: { printerIp: string; items: { id: string }[] }[];
    };
    expect(plan.jobs).toMatchObject([
      { printerIp: printer.ipAddress, items: [{ id: item.id }] },
    ]);
    expect((await claim())?.id).toBe(tasks[1].id);
  });

  it("lets an administrator omit one dish from both main and kitchen manual copies", async () => {
    const original = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const second = await prisma.product.create({
      data: {
        categoryId: original.categoryId,
        name: "Second printed dish",
        slug: `second-printed-${randomUUID()}`,
        description: "Print selection test",
        price: 20,
      },
    });
    const printer = await prisma.receiptPrinter.findFirstOrThrow({
      where: { isActive: true },
    });
    await prisma.receiptPrintSettings.update({
      where: { id: "default" },
      data: { mainPrinterId: printer.id, mainCopies: 2 },
    });
    const order = await create(false, {
      ...body(),
      items: [
        { productId, quantity: 1 },
        { productId: second.id, quantity: 1 },
      ],
    });
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
    });
    const skipped = items.find((item) => item.productId === productId)!;
    const kept = items.find((item) => item.productId === second.id)!;
    const selection = {
      idempotencyKey: randomUUID(),
      itemRoutes: [{ itemId: skipped.id, printerId: null, skip: true }],
    };
    await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth(Role.OPERATOR))
      .send(selection)
      .expect(403);
    const result = await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send(selection)
      .expect(201);
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
    });
    expect(tasks.map((task) => task.status)).toEqual([
      "CANCELLED",
      "CANCELLED",
      "PENDING",
      "PENDING",
    ]);
    expect(result.body).toMatchObject({ id: tasks[2]!.id });
    for (const task of tasks.slice(2)) {
      const plan = task.plan as {
        mainJob: { items: { id: string }[] };
        jobs: { items: { id: string }[] }[];
        metadata: { customerNote: string };
        summary: { total: number };
      };
      expect(plan.mainJob.items.map((item) => item.id)).toEqual([kept.id]);
      expect(
        plan.jobs.flatMap((job) => job.items.map((item) => item.id)),
      ).not.toContain(skipped.id);
      expect(plan.metadata.customerNote).toContain("ВЫБОРОЧНАЯ ПЕЧАТЬ");
      expect(plan.summary.total).toBe(order.total);
    }
    expect(
      (tasks[2]!.plan as { jobs: { items: { id: string }[] }[] }).jobs.flatMap(
        (job) => job.items.map((item) => item.id),
      ),
    ).toEqual([kept.id]);
    expect((tasks[3]!.plan as { jobs: unknown[] }).jobs).toEqual([]);
  });

  it("rejects empty or contradictory manual selections without cancelling automatic tasks", async () => {
    const order = await create();
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send({
        idempotencyKey: randomUUID(),
        itemRoutes: [{ itemId: item.id, printerId: null, skip: true }],
      })
      .expect(400);
    const printer = await prisma.receiptPrinter.findFirstOrThrow({
      where: { isActive: true },
    });
    await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send({
        idempotencyKey: randomUUID(),
        itemRoutes: [{ itemId: item.id, printerId: printer.id, skip: true }],
      })
      .expect(400);
    expect(
      await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        select: { status: true },
      }),
    ).toEqual([{ status: "PENDING" }]);
  });

  it("manual main-only routing needs a configured cash register and rejects unknown lines", async () => {
    const order = await create();
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const printer = await prisma.receiptPrinter.findFirstOrThrow({
      where: { isActive: true },
    });
    const before = await prisma.receiptPrintSettings.findUnique({
      where: { id: "default" },
    });
    try {
      await prisma.receiptPrintSettings.upsert({
        where: { id: "default" },
        create: { id: "default", mainPrinterId: null, mainCopies: 2 },
        update: { mainPrinterId: null, mainPrinterIp: null, mainCopies: 2 },
      });
      await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({
          idempotencyKey: randomUUID(),
          itemRoutes: [{ itemId: randomUUID(), printerId: null }],
        })
        .expect(409);
      await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({
          idempotencyKey: randomUUID(),
          itemRoutes: [{ itemId: item.id, printerId: null }],
        })
        .expect(409);
      await prisma.receiptPrintSettings.update({
        where: { id: "default" },
        data: { mainPrinterId: printer.id },
      });
      const response = await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({
          idempotencyKey: randomUUID(),
          itemRoutes: [{ itemId: item.id, printerId: null }],
        })
        .expect(201);
      const task = await prisma.receiptPrintTask.findUniqueOrThrow({
        where: { id: (response.body as ReceiptTaskResponseDto).id },
      });
      const plan = task.plan as {
        mainJob: { printerIp: string } | null;
        mainCopies: number;
        jobs: unknown[];
      };
      expect(plan.mainJob?.printerIp).toBe(printer.ipAddress);
      expect(plan.mainCopies).toBe(1);
      expect(plan.jobs).toEqual([]);
      expect(
        await prisma.receiptPrintTask.count({
          where: { orderId: order.id, eventKey: { startsWith: "MANUAL:" } },
        }),
      ).toBe(2);
    } finally {
      if (before)
        await prisma.receiptPrintSettings.update({
          where: { id: "default" },
          data: {
            mainPrinterId: before.mainPrinterId,
            mainPrinterIp: before.mainPrinterIp,
            mainCopies: before.mainCopies,
          },
        });
      else
        await prisma.receiptPrintSettings.delete({ where: { id: "default" } });
    }
  });

  it("changes the main-copy count without replacing the selected cash register", async () => {
    const path = "/api/v1/catalog/receipt-print-settings";
    const original = await request(server)
      .get("/api/v1/catalog/admin/receipt-print-settings")
      .set(auth())
      .expect(200);
    const updated = await request(server)
      .patch(path)
      .set(auth())
      .send({ mainCopies: 3 })
      .expect(200);
    expect(updated.body).toMatchObject({
      mainCopies: 3,
      mainPrinterId: (original.body as { mainPrinterId: string | null })
        .mainPrinterId,
    });
    await request(server)
      .patch(path)
      .set(auth())
      .send({ mainCopies: 0 })
      .expect(400);
    await request(server)
      .patch(path)
      .set(auth())
      .send({
        mainCopies: (original.body as { mainCopies: number }).mainCopies,
      })
      .expect(200);
  });

  it("lets the API schedule each main copy as a legacy-compatible task", async () => {
    const before = await prisma.receiptPrintSettings.findUnique({
      where: { id: "default" },
    });
    const printer = await prisma.receiptPrinter.findFirstOrThrow({
      where: { isActive: true },
    });
    await prisma.receiptPrintSettings.upsert({
      where: { id: "default" },
      create: { id: "default", mainPrinterId: printer.id, mainCopies: 3 },
      update: { mainPrinterId: printer.id, mainCopies: 3 },
    });
    try {
      const order = await create();
      const automatic = await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
      });
      expect(automatic).toHaveLength(3);
      expect(automatic.map((task) => task.eventKey)).toEqual([
        `ORDER_CREATED:${order.id}`,
        `ORDER_CREATED:${order.id}:MAIN_COPY:2`,
        `ORDER_CREATED:${order.id}:MAIN_COPY:3`,
      ]);
      expect(
        automatic.map((task) => {
          const plan = task.plan as {
            mainJob: unknown;
            mainCopies: number;
            jobs: unknown[];
          };
          return [Boolean(plan.mainJob), plan.mainCopies, plan.jobs.length];
        }),
      ).toEqual([
        [true, 1, 1],
        [true, 1, 0],
        [true, 1, 0],
      ]);

      const key = randomUUID();
      const manual = () =>
        request(server)
          .post(`${root}/orders/${order.id}/reprint`)
          .set(auth())
          .send({ idempotencyKey: key })
          .expect(201);
      const first = await manual();
      expect((await manual()).body).toMatchObject({
        id: (first.body as ReceiptTaskResponseDto).id,
      });
      const tasks = await prisma.receiptPrintTask.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
      });
      expect(tasks.map((task) => task.status)).toEqual([
        "CANCELLED",
        "CANCELLED",
        "CANCELLED",
        "PENDING",
        "PENDING",
        "PENDING",
      ]);
      expect(
        tasks.slice(3).map((task) => {
          const plan = task.plan as {
            mainJob: unknown;
            mainCopies: number;
            jobs: unknown[];
          };
          return [Boolean(plan.mainJob), plan.mainCopies, plan.jobs.length];
        }),
      ).toEqual([
        [true, 1, 1],
        [true, 1, 0],
        [true, 1, 0],
      ]);
    } finally {
      if (before) {
        await prisma.receiptPrintSettings.update({
          where: { id: "default" },
          data: {
            mainPrinterId: before.mainPrinterId,
            mainPrinterIp: before.mainPrinterIp,
            mainCopies: before.mainCopies,
          },
        });
      } else {
        await prisma.receiptPrintSettings.delete({ where: { id: "default" } });
      }
    }
  });

  it("refuses manual print while an automatic receipt is processing", async () => {
    const order = await create();
    const inFlight = (await claim())!;
    await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send({ idempotencyKey: randomUUID() })
      .expect(409);
    expect(
      await prisma.receiptPrintTask.count({ where: { orderId: order.id } }),
    ).toBe(1);
    await outcome(inFlight, "DELIVERED").expect(201);
    await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send({ idempotencyKey: randomUUID() })
      .expect(201);
  });

  it("publishes hours and blocks customer orders while closed but permits assisted calls", async () => {
    const current = await request(server)
      .get("/api/v1/ordering-hours")
      .expect(200);
    const localNow = new Date(Date.now() + 5 * 3_600_000);
    const minute = localNow.getUTCHours() * 60 + localNow.getUTCMinutes();
    const format = (offset: number) => {
      const value = (minute + offset) % 1440;
      return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    };
    const closed = {
      enabled: true,
      opensAt: format(5),
      closesAt: format(10),
      version: (current.body as { version: number }).version,
    };
    await request(server)
      .patch("/api/v1/ordering-hours")
      .set(auth(Role.OPERATOR))
      .send(closed)
      .expect(403);
    const updated = await request(server)
      .patch("/api/v1/ordering-hours")
      .set(auth())
      .send(closed)
      .expect(200);
    try {
      expect(updated.body).toMatchObject({
        enabled: true,
        isOpen: false,
        timezone: "Asia/Ashgabat",
      });
      await request(server)
        .patch("/api/v1/ordering-hours")
        .set(auth())
        .send(closed)
        .expect(409);
      await request(server)
        .post("/api/v1/orders")
        .set(auth(Role.CUSTOMER))
        .send(body())
        .expect(409);
      await create(true);
    } finally {
      await request(server)
        .patch("/api/v1/ordering-hours")
        .set(auth())
        .send({
          ...closed,
          enabled: false,
          version: (updated.body as { version: number }).version,
        })
        .expect(200);
    }
  });
  it("serializes concurrent working-hour edits and rejects equal endpoints", async () => {
    const current = await request(server)
      .get("/api/v1/ordering-hours")
      .expect(200);
    await request(server)
      .patch("/api/v1/ordering-hours")
      .set(auth())
      .send({
        enabled: true,
        opensAt: "10:00",
        closesAt: "10:00",
        version: (current.body as { version: number }).version,
      })
      .expect(400);
    const version = (current.body as { version: number }).version;
    const edit = (opensAt: string) =>
      request(server)
        .patch("/api/v1/ordering-hours")
        .set(auth())
        .send({ enabled: false, opensAt, closesAt: "22:00", version });
    const results = await Promise.all([edit("08:00"), edit("09:00")]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
  });
  it("counts verified customers separately from assisted accounts and denies other roles", async () => {
    const path = "/api/v1/staff/customer-counts";
    await request(server).get(path).set(auth(Role.CUSTOMER)).expect(403);
    await request(server).get(path).set(auth(Role.OPERATOR)).expect(403);
    const before = await request(server).get(path).set(auth()).expect(200);
    await prisma.user.create({
      data: {
        phone: "+99365009981",
        role: Role.CUSTOMER,
        lastLoginAt: new Date(),
      },
    });
    await prisma.user.create({
      data: { phone: "+99365009982", role: Role.CUSTOMER },
    });
    const after = await request(server).get(path).set(auth()).expect(200);
    const previous = before.body as {
      registered: number;
      assistedOnly: number;
      totalCustomerAccounts: number;
    };
    expect(after.body).toMatchObject({
      registered: previous.registered + 1,
      assistedOnly: previous.assistedOnly + 1,
      totalCustomerAccounts: previous.totalCustomerAccounts + 2,
    });
  });
  it("deduplicates concurrent creation including nested item content", async () => {
    const input = body();
    const [a, b] = await Promise.all([
      create(false, input),
      create(false, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.receiptPrintTask.count({ where: { orderId: a.id } }),
    ).toBe(1);
    await request(server)
      .post("/api/v1/orders")
      .set(auth(Role.CUSTOMER))
      .send({ ...input, items: [{ productId, quantity: 2 }] })
      .expect(409);
    const assisted = body();
    const [c, d] = await Promise.all([
      create(true, assisted),
      create(true, assisted),
    ]);
    expect(c.id).toBe(d.id);
    expect(
      await prisma.receiptPrintTask.count({ where: { orderId: c.id } }),
    ).toBe(1);
  });
  it("returns the committed order when a racing retry sees changed availability", async () => {
    const input = body();
    const order = await create(false, input);
    // The retry's initial read raced the first commit; availability then changed.
    const lookup = vi
      .spyOn(prisma.orderCreationRequest, "findUnique")
      .mockResolvedValueOnce(null);
    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    try {
      const retried = await create(false, input);
      expect(retried.id).toBe(order.id);
      expect(
        await prisma.receiptPrintTask.count({ where: { orderId: order.id } }),
      ).toBe(1);
    } finally {
      lookup.mockRestore();
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: true },
      });
    }
  });
  it("leases once across competing tabs/stations and rejects foreign acknowledgments", async () => {
    await create();
    await create();
    const results = await Promise.all([claim(), claim(otherStation)]);
    const tasks = results.filter(
      (task): task is ReceiptClaimResponseDto => task !== null,
    );
    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    await outcome(task, "DELIVERED", Role.OPERATOR).expect(409);
    await request(server)
      .post(`${root}/${task.id}/outcome`)
      .set(auth())
      .send({
        stationId: task.stationId,
        claimToken: randomUUID(),
        outcome: "DELIVERED",
      })
      .expect(409);
    await request(server)
      .post(`${root}/${task.id}/heartbeat`)
      .set(auth())
      .send({ stationId: task.stationId, claimToken: task.claimToken })
      .expect(201);
    await outcome(task, "DELIVERED").expect(201);
    await outcome(task, "DELIVERED").expect(201);
    expect((await claim())?.id).not.toBe(task.id);
  });
  it("supports the standalone agent identity without a user session", async () => {
    await create();
    const queue = app.get(ReceiptQueueService);
    const task = (await queue.claimAgent(station)).task!;
    expect(task.stationId).toBe(station);
    await expect(
      queue.heartbeatAgent(station, task.id, {
        claimToken: task.claimToken,
      }),
    ).resolves.toEqual({ ok: true });
    await queue.acknowledgeAgent(station, task.id, {
      claimToken: task.claimToken,
      outcome: "DELIVERED",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: task.id, action: "receipt.delivery_result" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.actorId).toBeNull();
    expect(audit.metadata).toMatchObject({
      stationId: station,
      authType: "PRINT_AGENT",
    });
  });
  it("keeps the identity through indefinite offline retries and expired leases", async () => {
    await create();
    const first = (await claim())!;
    await outcome(first, "RETRY").expect(201);
    expect(await claim()).toBeNull();
    await request(server)
      .post(`${root}/${first.id}/retry`)
      .set(auth())
      .expect(201);
    expect(await claim(otherStation)).toBeNull();
    const second = (await claim())!;
    expect(second.dispatchId).toBe(first.dispatchId);
    expect(second.plan).toEqual(first.plan);
    expect(second.claimToken).not.toBe(first.claimToken);
    await outcome(first, "DELIVERED").expect(409);
    await prisma.receiptPrintTask.update({
      where: { id: second.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1000), attempts: 99 },
    });
    expect(await claim(otherStation)).toBeNull();
    const recovered = (await claim())!;
    expect(recovered.dispatchId).toBe(first.dispatchId);
    expect(recovered.attempts).toBe(100);
    await outcome(recovered, "RETRY").expect(201);
    const saved = await prisma.receiptPrintTask.findUniqueOrThrow({
      where: { id: recovered.id },
    });
    expect(saved.status).toBe("PENDING");
    expect(saved.nextAttemptAt.getTime() - Date.now()).toBeLessThanOrEqual(
      60_000,
    );
  });
  it("stops ambiguous sends and gives deliberate reprints a new, idempotent identity", async () => {
    const order = await create();
    const first = (await claim())!;
    await outcome(first, "UNCERTAIN").expect(201);
    expect(await claim()).toBeNull();
    await request(server)
      .post(`${root}/${first.id}/retry`)
      .set(auth())
      .expect(409);
    const key = randomUUID();
    const repeat = () =>
      request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth())
        .send({ idempotencyKey: key })
        .expect(201);
    const [a, b] = await Promise.all([repeat(), repeat()]);
    expect((a.body as ReceiptTaskResponseDto).id).toBe(
      (b.body as ReceiptTaskResponseDto).id,
    );
    const reprint = (await claim())!;
    expect(reprint.dispatchId).not.toBe(first.dispatchId);
    const other = await create();
    await request(server)
      .post(`${root}/orders/${other.id}/reprint`)
      .set(auth())
      .send({ idempotencyKey: key })
      .expect(409);
    const list = await request(server).get(root).set(auth()).expect(200);
    expect(list.body).toMatchObject({ needsAttention: 0 });
    const history = await request(server)
      .get(`${root}/history`)
      .set(auth())
      .expect(200);
    expect((history.body as { items: ReceiptTaskResponseDto[] }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, status: "CANCELLED" }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain("Queue test address");
  });
  it("queues cancellation after commit and never creates a second cancellation task", async () => {
    const order = await create();
    await request(server)
      .patch(`/api/v1/orders/${order.id}/cancel`)
      .set(auth())
      .send({ version: order.version, reason: "Queue cancellation" })
      .expect(200);
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
    });
    expect(tasks.map((t) => t.documentType)).toEqual(["ORDER", "CANCELLATION"]);
    await request(server)
      .patch(`/api/v1/orders/${order.id}/cancel`)
      .set(auth())
      .send({ version: order.version, reason: "Queue cancellation" })
      .expect(409);
    expect(
      await prisma.receiptPrintTask.count({ where: { orderId: order.id } }),
    ).toBe(2);
  });
  it("manual printing of a cancelled order supersedes its automatic cancellation receipt", async () => {
    const order = await create();
    await request(server)
      .patch(`/api/v1/orders/${order.id}/cancel`)
      .set(auth())
      .send({ version: order.version, reason: "Customer cancelled" })
      .expect(200);
    const response = await request(server)
      .post(`${root}/orders/${order.id}/reprint`)
      .set(auth())
      .send({ idempotencyKey: randomUUID() })
      .expect(201);
    const tasks = await prisma.receiptPrintTask.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
    });
    expect(tasks.map((task) => task.status)).toEqual([
      "CANCELLED",
      "CANCELLED",
      "PENDING",
    ]);
    expect(tasks[2].id).toBe((response.body as ReceiptTaskResponseDto).id);
    expect(tasks[2].documentType).toBe("CANCELLATION");
  });
  it("denies forbidden roles on every queue mutation and validates payloads", async () => {
    const order = await create();
    const task = (await claim())!;
    const unauthenticated = await request(server).get(root);
    expect(unauthenticated.status, JSON.stringify(unauthenticated.body)).toBe(
      401,
    );
    for (const role of [
      Role.CUSTOMER,
      Role.COOK,
      Role.COURIER,
      Role.ACCOUNTANT,
    ]) {
      const response = await request(server).get(root).set(auth(role));
      expect(response.status, `${role}: ${JSON.stringify(response.body)}`).toBe(403);
      await request(server)
        .post(`${root}/claim`)
        .set(auth(role))
        .send({ stationId: station })
        .expect(403);
      await outcome(task, "DELIVERED", role).expect(403);
      await request(server)
        .post(`${root}/${task.id}/heartbeat`)
        .set(auth(role))
        .send({ stationId: station, claimToken: task.claimToken })
        .expect(403);
      await request(server)
        .post(`${root}/${task.id}/retry`)
        .set(auth(role))
        .expect(403);
      const forbiddenReprint = await request(server)
        .post(`${root}/orders/${order.id}/reprint`)
        .set(auth(role))
        .send({ idempotencyKey: randomUUID() });
      expect(forbiddenReprint.status, `${role}: ${JSON.stringify(forbiddenReprint.body)}`).toBe(403);
    }
    for (const role of [Role.ADMIN, Role.OPERATOR, Role.SUPER_ADMIN])
      await request(server).get(root).set(auth(role)).expect(200);
    await request(server)
      .post(`${root}/claim`)
      .set(auth())
      .send({ stationId: "bad" })
      .expect(400);
    await outcome(task, "PRINTED").expect(400);
    await request(server)
      .post(`${root}/${randomUUID()}/outcome`)
      .set(auth())
      .send({
        stationId: station,
        claimToken: task.claimToken,
        outcome: "DELIVERED",
      })
      .expect(404);
  });
});
