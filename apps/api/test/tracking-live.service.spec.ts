import { filter, firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { TrackingLiveService } from "../src/tracking/tracking-live.service";

describe("TrackingLiveService", () => {
  it("pushes accepted and stopped courier locations without customer data", async () => {
    const live = new TrackingLiveService();
    const accepted = firstValueFrom(
      live.stream().pipe(filter(({ type }) => type === "courier.location")),
    );
    live.publishLocation("11111111-1111-4111-8111-111111111111", {
      latitude: 37.96,
      longitude: 58.326,
      recordedAt: "2026-08-02T15:00:00.000Z",
      receivedAt: "2026-08-02T15:00:01.000Z",
    });

    await expect(accepted).resolves.toMatchObject({
      type: "courier.location",
      data: {
        type: "courier.location",
        courierId: "11111111-1111-4111-8111-111111111111",
        location: { latitude: 37.96, longitude: 58.326 },
      },
    });

    const stopped = firstValueFrom(
      live.stream().pipe(filter(({ type }) => type === "courier.location")),
    );
    live.publishLocation("11111111-1111-4111-8111-111111111111", null);
    await expect(stopped).resolves.toMatchObject({
      data: { location: null },
    });
  });
});
