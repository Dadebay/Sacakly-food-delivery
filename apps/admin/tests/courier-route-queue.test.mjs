import assert from "node:assert/strict";
import test from "node:test";
import { createRouteRequestQueue } from "../src/entities/courier/api/route-request-queue.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("route requests settle independently, limit concurrency and skip cancelled queued work", async () => {
  const run = createRouteRequestQueue(2);
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const started = [];
  const complete = [];
  const jobs = controllers.map((controller, index) =>
    run(() => {
      started.push(index);
      return new Promise((resolve) => {
        complete[index] = resolve;
      });
    }, controller.signal),
  );
  const cancelled = assert.rejects(jobs[2], { name: "AbortError" });
  await flush();
  assert.deepEqual(started, [0, 1]);
  controllers[2].abort();
  await cancelled;
  complete[1]("second route");
  assert.equal(await jobs[1], "second route");
  await flush();
  assert.deepEqual(started, [0, 1, 3]);
  complete[3]("fourth route");
  complete[0]("first route");
  assert.deepEqual(await Promise.all([jobs[0], jobs[3]]), [
    "first route",
    "fourth route",
  ]);
});

test("failed and aborted routes do not block the remaining couriers", async () => {
  const run = createRouteRequestQueue(1);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    run(() => assert.fail("aborted request started"), aborted.signal),
    { name: "AbortError" },
  );
  const failed = run(() => {
    throw new Error("routing unavailable");
  }, new AbortController().signal);
  const next = run(async () => "ready", new AbortController().signal);
  await assert.rejects(failed, /routing unavailable/);
  assert.equal(await next, "ready");
});
