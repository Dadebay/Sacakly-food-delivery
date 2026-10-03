import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

const values = new Map();
globalThis.sessionStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const { ApiClient } = await import("../src/api/client.ts");
const originalFetch = globalThis.fetch;
const response = (status, value) => ({ status, ok: status >= 200 && status < 300, json: async () => value });

beforeEach(() => values.clear());
afterEach(() => { globalThis.fetch = originalFetch; });

test("OTP login stores the returned session and sends no Authorization header", async () => {
  const calls = [];
  const session = { accessToken: "access", refreshToken: "refresh", user: { phone: "+99362969614" } };
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return response(200, calls.length === 1 ? { accepted: true } : session);
  };
  const client = new ApiClient();
  await client.requestOtp("+99362969614");
  await client.verifyOtp("+99362969614", "123456");
  assert.equal(client.getSession().accessToken, "access");
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(JSON.parse(values.get("alowlink.merchant.session")).refreshToken, "refresh");
});

test("parallel expired requests use one refresh and retry with the new access token", async () => {
  const client = new ApiClient();
  client.setSession({ accessToken: "old", refreshToken: "refresh", user: { phone: "+99362969614" } });
  let refreshes = 0;
  globalThis.fetch = async (path, options) => {
    if (path.endsWith("/auth/refresh")) {
      refreshes++;
      return response(200, { accessToken: "new", refreshToken: "rotated", user: { phone: "+99362969614" } });
    }
    return options.headers.Authorization === "Bearer new" ? response(200, { ok: true }) : response(401, {});
  };
  const [first, second] = await Promise.all([client.request("/x"), client.request("/y")]);
  assert.deepEqual([first, second], [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1);
});
