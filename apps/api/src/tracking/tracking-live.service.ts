import { Injectable, type MessageEvent } from "@nestjs/common";
import { interval, map, merge, Observable, Subject, takeUntil, timer } from "rxjs";
import type { CourierLocationDto, DispatchLiveEventDto } from "./tracking.dto";

const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_STREAM_LIFETIME_MS = 10 * 60 * 1_000;

@Injectable()
export class TrackingLiveService {
  private readonly updates = new Subject<MessageEvent>();

  publishLocation(courierId: string, location: CourierLocationDto | null) {
    const event: DispatchLiveEventDto = {
      type: "courier.location",
      courierId,
      location,
      sentAt: new Date().toISOString(),
    };
    this.updates.next({ type: event.type, data: event });
  }

  stream(): Observable<MessageEvent> {
    const heartbeats = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map(() => {
        const event: DispatchLiveEventDto = {
          type: "heartbeat",
          courierId: null,
          location: null,
          sentAt: new Date().toISOString(),
        };
        return { type: event.type, data: event } satisfies MessageEvent;
      }),
    );
    return merge(this.updates, heartbeats).pipe(
      takeUntil(timer(MAX_STREAM_LIFETIME_MS)),
    );
  }
}
