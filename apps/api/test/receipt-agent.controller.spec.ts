import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ReceiptAgentController } from "../src/orders/receipt-agent.controller";
import type { ReceiptQueueService } from "../src/orders/receipt-queue.service";

const stationId = "11111111-1111-4111-8111-111111111111";

function controller() {
  const claimAgent = vi.fn().mockResolvedValue({ task: null });
  const queue = {
    claimAgent,
  } as unknown as ReceiptQueueService;
  return { claimAgent, controller: new ReceiptAgentController(queue) };
}

describe("ReceiptAgentController", () => {
  it("passes the EXE persistent station UUID to the queue", async () => {
    const subject = controller();
    await expect(subject.controller.claim(stationId)).resolves.toEqual({
      task: null,
    });
    expect(subject.claimAgent).toHaveBeenCalledWith(stationId);
  });

  it("rejects a missing or malformed station header", async () => {
    const subject = controller();
    await expect(subject.controller.claim("not-a-uuid")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      subject.controller.claim(undefined as unknown as string),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
