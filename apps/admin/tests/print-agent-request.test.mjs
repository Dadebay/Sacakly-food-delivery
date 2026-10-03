import assert from "node:assert/strict";
import test from "node:test";
import { buildPrintAgentRequest } from "../src/features/receipt-printing/model/print-agent-request.ts";

const item = { id: "item-1", name: "Çörek", quantity: 2, unitPrice: 10 };
const kitchen = {
  printerIp: "192.168.0.86",
  printerPort: 9100,
  transport: "RAW_TCP",
  items: [item],
};
const main = { ...kitchen, printerIp: "192.168.123.100" };
const plan = {
  orderId: "order-1",
  orderNumber: 61,
  documentType: "CANCELLATION",
  cancellationReason: "Клиент отменил заказ",
  summary: {
    subtotal: 20,
    discount: 0,
    deliveryFee: 15,
    total: 35,
    deliveryAreaName: null,
  },
  metadata: {
    createdAt: "2026-09-03T10:18:00.000Z",
    customerPhone: "+99365000101",
    address: "Halturin",
  },
  mainJob: main,
  jobs: [kitchen],
  unassignedItems: [],
};

test("legacy agents receive exactly their supported fields without losing cancellations or prices", () => {
  assert.deepEqual(buildPrintAgentRequest(plan, false, "dispatch-1"), {
    dispatchId: "dispatch-1",
    orderId: plan.orderId,
    orderNumber: 61,
    documentType: "CANCELLATION",
    cancellationReason: plan.cancellationReason,
    summary: plan.summary,
    jobs: [main, kitchen],
    unassignedItems: [],
  });
});

test("new agents receive delivery metadata and distinct complete/kitchen copies", () => {
  const payload = buildPrintAgentRequest(plan, true, "dispatch-2");
  assert.deepEqual(payload.metadata, plan.metadata);
  assert.deepEqual(payload.jobs, [
    { ...main, copyType: "MAIN" },
    { ...kitchen, copyType: "KITCHEN" },
  ]);
  assert.deepEqual(plan.jobs, [kitchen]);
  assert.deepEqual(payload.summary, plan.summary);
  assert.equal(payload.documentType, "CANCELLATION");
  assert.equal(payload.cancellationReason, plan.cancellationReason);
});

test("disabling the main printer never promotes a kitchen copy to a customer receipt", () => {
  const payload = buildPrintAgentRequest(
    { ...plan, mainJob: null, metadata: undefined },
    true,
    "dispatch-3",
  );
  assert.deepEqual(payload.jobs, [{ ...kitchen, copyType: "KITCHEN" }]);
  assert.equal(payload.metadata, null);
});

test("the browser bridge sends only the single main job supplied by the API", () => {
  const payload = buildPrintAgentRequest({ ...plan, mainCopies: 2 }, true, "dispatch-4");
  assert.deepEqual(payload.jobs.map(({ copyType }) => copyType), ["MAIN", "KITCHEN"]);
  assert.equal(payload.jobs[0].printerIp, main.printerIp);
});
