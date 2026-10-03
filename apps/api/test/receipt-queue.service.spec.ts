import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env";
import { Role } from "../src/generated/prisma/client";
import type { OrdersService } from "../src/orders/orders.service";
import { ReceiptQueueService } from "../src/orders/receipt-queue.service";
import type { PrismaService } from "../src/prisma/prisma.service";

function service(direct: boolean) {
  const transaction = vi.fn();
  const prisma = {
    $transaction: transaction,
    receiptPrintTask: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
  const values: Partial<AppEnv> = {
    RECEIPT_AGENT_API_TOKEN: direct ? "r".repeat(48) : "",
  };
  const config = {
    get: (key: keyof AppEnv) => values[key],
  } as ConfigService<AppEnv, true>;
  return {
    transaction,
    queue: new ReceiptQueueService(prisma, {} as OrdersService, config),
  };
}

const admin = {
  id: "22222222-2222-4222-8222-222222222222",
  phone: "+99365000000",
  role: Role.ADMIN,
};

describe("ReceiptQueueService direct-agent mode", () => {
  it("advertises the direct consumer and blocks browser claims before a transaction", async () => {
    const { transaction, queue } = service(true);
    await expect(queue.list(admin)).resolves.toMatchObject({
      consumerMode: "DIRECT_AGENT",
      pending: 0,
      needsAttention: 0,
    });
    await expect(queue.claim(admin, randomUUID())).resolves.toEqual({
      task: null,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("keeps the legacy bridge mode until the dedicated key is configured", async () => {
    const { queue } = service(false);
    await expect(queue.list(admin)).resolves.toMatchObject({
      consumerMode: "BROWSER_BRIDGE",
    });
  });
});
