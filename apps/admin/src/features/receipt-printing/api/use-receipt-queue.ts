import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@sacakly/api-contract";
import { useSession } from "@/src/shared/auth";
import { consumeReceiptQueue, readAgentHealth } from "../model/queue-worker";
import {
  receiptQueueKey,
  RECEIPT_PRINT_AGENT_URL,
} from "./use-receipt-printing";

const interval = () => (document.visibilityState === "visible" ? 5_000 : false);
export function useReceiptQueue(historyOpen = false) {
  const { authorizedRequest, session } = useSession();
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: [...receiptQueueKey, session?.user.id],
    queryFn: ({ signal }) =>
      authorizedRequest<components["schemas"]["ReceiptQueueResponseDto"]>(
        "/receipt-print-tasks",
        { signal },
      ),
    enabled: Boolean(session),
    staleTime: 3_000,
    gcTime: 60_000,
    retry: false,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const history = useQuery({
    queryKey: [...receiptQueueKey, "history", session?.user.id],
    queryFn: ({ signal }) =>
      authorizedRequest<
        components["schemas"]["ReceiptQueueHistoryResponseDto"]
      >("/receipt-print-tasks/history", { signal }),
    enabled: Boolean(session) && historyOpen,
    staleTime: 10_000,
  });
  const directMode = queue.data?.consumerMode === "DIRECT_AGENT";
  const agent = useQuery({
    queryKey: ["receipt-agent", RECEIPT_PRINT_AGENT_URL],
    queryFn: ({ signal }) =>
      readAgentHealth(
        RECEIPT_PRINT_AGENT_URL,
        AbortSignal.any([signal, AbortSignal.timeout(3_000)]),
      ),
    enabled: Boolean(session) && queue.isSuccess && !directMode,
    staleTime: 3_000,
    gcTime: 60_000,
    retry: false,
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const worker = useMutation({
    mutationFn: (stationId: string) =>
      consumeReceiptQueue(
        authorizedRequest,
        RECEIPT_PRINT_AGENT_URL,
        stationId,
      ),
    retry: false,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: receiptQueueKey }),
  });
  const busy = useRef(false);
  const lastCycle = useRef(0);
  const { mutate } = worker;
  useEffect(() => {
    if (
      busy.current ||
      directMode ||
      queue.isError ||
      agent.isError ||
      !queue.data?.pending ||
      !agent.data ||
      document.visibilityState !== "visible"
    )
      return;
    // One attempt per polling interval avoids a claim storm while another tab
    // owns the lease or an unavailable printer is waiting for its retry time.
    if (Date.now() - lastCycle.current < 4_000) return;
    lastCycle.current = Date.now();
    busy.current = true;
    mutate(agent.data.agentId, {
      onSettled: () => {
        busy.current = false;
      },
    });
  }, [
    queue.dataUpdatedAt,
    queue.data?.pending,
    queue.isError,
    directMode,
    agent.dataUpdatedAt,
    agent.data,
    agent.isError,
    mutate,
  ]);
  const retry = useMutation({
    mutationFn: (id: string) =>
      authorizedRequest(`/receipt-print-tasks/${id}/retry`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      }),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: receiptQueueKey }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      authorizedRequest<components["schemas"]["ReceiptTaskResponseDto"]>(
        `/receipt-print-tasks/${id}/cancel`,
        { method: "POST", signal: AbortSignal.timeout(10_000) },
      ),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: receiptQueueKey }),
  });
  return { queue, history, agent, worker, retry, cancel, directMode };
}
