import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { components } from "@alowalow/api-contract";
import { openApiEventStream } from "@/src/shared/api/api-client";
import { useSession } from "@/src/shared/auth";
import { courierQueryKeys } from "./dispatch-query";
import { applyDispatchLocationUpdate } from "../model/dispatch-location-update";
import type { DispatchSnapshot } from "../model/types";

type DispatchLiveEvent = components["schemas"]["DispatchLiveEventDto"];
export type DispatchLiveState = "connecting" | "live" | "fallback";

const RECONNECT_DELAY_MS = 2_000;

export function useDispatchLiveUpdates(): DispatchLiveState {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [state, setState] = useState<DispatchLiveState>("connecting");
  const accessToken = session?.accessToken;
  const userId = session?.user.id;
  const canView = Boolean(session);

  useEffect(() => {
    if (!accessToken || !userId || !canView) {
      return;
    }

    const controller = new AbortController();
    const queryKey = courierQueryKeys.dispatch(userId);

    const applyEvent = (event: DispatchLiveEvent) => {
      if (event.type !== "courier.location" || !event.courierId) {
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: courierQueryKeys.route(userId, event.courierId),
      });
      const current = queryClient.getQueryData<DispatchSnapshot>(queryKey);
      if (!current) return;
      const updated = applyDispatchLocationUpdate(current, {
        courierId: event.courierId,
        location: event.location,
        sentAt: event.sentAt,
      });
      if (!updated) {
        void queryClient.invalidateQueries({ queryKey });
        return;
      }
      queryClient.setQueryData<DispatchSnapshot>(queryKey, updated);
    };

    const connect = async () => {
      while (!controller.signal.aborted) {
        try {
          setState("connecting");
          const stream = await openApiEventStream(
            "/tracking/dispatch/live",
            accessToken,
            controller.signal,
          );
          setState("live");
          await consumeEventStream(stream, applyEvent, controller.signal);
        } catch {
          if (controller.signal.aborted) return;
          setState("fallback");
        }
        await waitForReconnect(controller.signal);
      }
    };

    void connect();
    return () => controller.abort();
  }, [accessToken, canView, queryClient, userId]);

  return canView ? state : "fallback";
}

async function consumeEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: DispatchLiveEvent) => void,
  signal: AbortSignal,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          const parsed: unknown = JSON.parse(data);
          if (isDispatchLiveEvent(parsed)) onEvent(parsed);
        }
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function isDispatchLiveEvent(value: unknown): value is DispatchLiveEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<DispatchLiveEvent>;
  return (
    (event.type === "courier.location" || event.type === "heartbeat") &&
    typeof event.sentAt === "string"
  );
}

function waitForReconnect(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timeout = window.setTimeout(resolve, RECONNECT_DELAY_MS);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
