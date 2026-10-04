import type { components } from "@sacakly/api-contract";

type ReceiptPrintPlan = components["schemas"]["ReceiptPrintPlanResponseDto"];

export function buildPrintAgentRequest(
  plan: ReceiptPrintPlan,
  supportsDetails: boolean,
  dispatchId: string,
) {
  const jobs = [...(plan.mainJob ? [plan.mainJob] : []), ...plan.jobs];
  return {
    dispatchId,
    orderId: plan.orderId,
    orderNumber: plan.orderNumber,
    documentType: plan.documentType,
    cancellationReason: plan.cancellationReason,
    summary: plan.summary,
    ...(supportsDetails ? { metadata: plan.metadata ?? null } : {}),
    jobs: supportsDetails
      ? jobs.map((job, index) => ({
          ...job,
          copyType: plan.mainJob && index === 0 ? "MAIN" : "KITCHEN",
        }))
      : jobs,
    unassignedItems: plan.unassignedItems,
  };
}
