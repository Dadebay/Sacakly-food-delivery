import type { components } from "@alowalow/api-contract";
import { buildPrintAgentRequest } from "./print-agent-request.ts";

type Claim = components["schemas"]["ReceiptClaimResponseDto"];
type Outcome = components["schemas"]["ReceiptOutcomeDto"];
export type AuthorizedRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;
export type AgentHealth = { agentId: string; capabilities: string[] };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function readAgentHealth(
  url: string,
  signal: AbortSignal,
): Promise<AgentHealth> {
  const response = await fetch(`${url}/health`, {
    signal,
    mode: "cors",
    cache: "no-store",
  });
  const health = object(await response.json());
  if (
    !response.ok ||
    typeof health.agentId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(health.agentId) ||
    !Array.isArray(health.capabilities) ||
    !health.capabilities.includes("dispatch-journal-v1") ||
    !health.capabilities.includes("receipt-layout-v2")
  ) {
    throw new Error(
      "Обновите программу печати: нужна версия с защитой от повторов.",
    );
  }
  return {
    agentId: health.agentId,
    capabilities: health.capabilities as string[],
  };
}

export function receiptOutcome(
  task: Claim,
  status: number,
  value: unknown,
): Pick<Outcome, "outcome" | "errorCode"> {
  const body = object(value);
  if (body.agentId !== task.stationId || body.dispatchId !== task.dispatchId) {
    return { outcome: "RETRY", errorCode: "AGENT_UNAVAILABLE" };
  }
  if (body.uncertain === true)
    return { outcome: "UNCERTAIN", errorCode: "DELIVERY_UNCERTAIN" };
  const expected = buildPrintAgentRequest(
    task.plan,
    true,
    task.dispatchId,
  ).jobs;
  const printed = Array.isArray(body.printed) ? body.printed.map(object) : [];
  if (
    status === 200 &&
    body.orderId === task.orderId &&
    Array.isArray(body.failed) &&
    body.failed.length === 0 &&
    printed.length === expected.length &&
    expected.every(
      (job, index) =>
        printed[index].printerIp === job.printerIp &&
        printed[index].printerPort === job.printerPort,
    )
  ) {
    return { outcome: "DELIVERED" };
  }
  if (body.retryable === true)
    return { outcome: "RETRY", errorCode: "PRINTER_UNAVAILABLE" };
  return { outcome: "UNCERTAIN", errorCode: "DELIVERY_UNCERTAIN" };
}

// The server retains ownership and payload across page closures and lost ACKs.
// An expired lease returns to the SAME persistent agent, whose journal replays
// completed copies. Browser storage is never the source of queue truth.
export async function consumeReceiptQueue(
  request: AuthorizedRequest,
  agentUrl: string,
  stationId: string,
) {
  const { task } = await request<
    components["schemas"]["ReceiptClaimResultDto"]
  >("/receipt-print-tasks/claim", {
    method: "POST",
    body: JSON.stringify({ stationId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!task) return null;
  const lease = { stationId, claimToken: task.claimToken };
  const heartbeat = setInterval(() => {
    void request(`/receipt-print-tasks/${task.id}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(lease),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      /* Lease recovery is persistent on the server. */
    });
  }, 30_000);
  try {
    const payload = {
      ...buildPrintAgentRequest(task.plan, true, task.dispatchId),
      agentId: stationId,
    };
    let outcome: Pick<Outcome, "outcome" | "errorCode">;
    if (!payload.jobs.length) {
      outcome = { outcome: "FAILED", errorCode: "NO_PRINTERS" };
    } else {
      try {
        const response = await fetch(`${agentUrl}/v1/print`, {
          method: "POST",
          mode: "cors",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(130_000),
          body: JSON.stringify(payload),
        });
        outcome = receiptOutcome(task, response.status, await response.json());
      } catch {
        // Never invent success and never allocate a new dispatch after a lost
        // response. Retrying this identity only consults/resumes its journal.
        outcome = { outcome: "RETRY", errorCode: "AGENT_UNAVAILABLE" };
      }
    }
    await request(`/receipt-print-tasks/${task.id}/outcome`, {
      method: "POST",
      body: JSON.stringify({ ...lease, ...outcome }),
      signal: AbortSignal.timeout(10_000),
    });
    return outcome;
  } finally {
    clearInterval(heartbeat);
  }
}
