const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";
const courierPhone = "+99365000004";
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (HTTP ${response.status}): ${value?.message ?? "unknown error"}`);
  }
  return value;
}

async function login(phone) {
  const requested = await api("/auth/otp/request", {
    method: "POST",
    body: { phone },
  });
  if (!requested.devCode) {
    throw new Error("This helper is for the development API only (devCode is unavailable).");
  }
  return api("/auth/otp/verify", {
    method: "POST",
    body: { phone, code: requested.devCode },
  });
}

async function transition(orderId, version, status, token) {
  return api(`/orders/${orderId}/transition`, {
    method: "PATCH",
    token,
    body: { status, version },
  });
}

const uniqueCustomerPhone = `+99362${String(Date.now() % 1000000).padStart(6, "0")}`;
// The public OTP endpoint is deliberately rate-limited to three requests per
// minute per IP. Space the four local test logins so the helper validates the
// same protection production clients use.
const customer = await login(uniqueCustomerPhone);
await wait(21_000);
const operator = await login("+99365000002");
await wait(21_000);
const cook = await login("+99365000003");
await wait(21_000);
const courier = await login(courierPhone);
const products = await api("/catalog/products");

const product = products[0];
if (!product?.id) throw new Error("No catalog product is available for the test order.");

let order = await api("/orders", {
  method: "POST",
  token: customer.accessToken,
  body: {
    items: [{ productId: product.id, quantity: 1 }],
    addressLabel: "Yerel rota testi",
    address: "Ashgabat rota test noktası",
    latitude: 37.9712,
    longitude: 58.3617,
    entrance: "1",
    floor: "2",
    customerNote: "Yerel kurier rota testi",
  },
});

order = await transition(order.id, order.version, "READY", cook.accessToken);
order = await api(`/orders/${order.id}/assign-courier`, {
  method: "PATCH",
  token: operator.accessToken,
  body: { courierId: courier.user.id, version: order.version },
});

const route = await api("/orders/courier/route", { token: courier.accessToken });
console.log(JSON.stringify({
  order: {
    id: order.id,
    number: order.number,
    status: order.status,
    address: order.address,
    latitude: order.latitude,
    longitude: order.longitude,
  },
  route: {
    routingStatus: route.routingStatus,
    stopCount: route.stops.length,
    hasRoadGeometry: route.route !== null,
  },
}, null, 2));
