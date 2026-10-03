import { chmod, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";
const statePath =
  process.env.COURIER_DEMO_STATE_PATH ??
  join(tmpdir(), "alowalow-local-courier-demo.json");
const command = process.argv[2] ?? "setup";

const courierPaths = [
  [
    { latitude: 37.9601, longitude: 58.3261 },
    { latitude: 37.9578, longitude: 58.3378 },
    { latitude: 37.9519, longitude: 58.3508 },
    { latitude: 37.9442, longitude: 58.3641 },
  ],
  [
    { latitude: 37.9825, longitude: 58.3052 },
    { latitude: 37.9798, longitude: 58.3155 },
    { latitude: 37.9752, longitude: 58.3269 },
    { latitude: 37.9694, longitude: 58.3392 },
  ],
];

const deliveryStops = [
  {
    addressLabel: "Демо · Беркарар",
    address: "Торговый центр Беркарар, Ашхабад",
    latitude: 37.9279,
    longitude: 58.3773,
    entrance: "Главный вход",
    customerNote: "Позвонить за 3 минуты",
  },
  {
    addressLabel: "Демо · Мир 3",
    address: "Микрорайон Мир 3, Ашхабад",
    latitude: 37.954,
    longitude: 58.397,
    entrance: "2",
    floor: "4",
    apartment: "18",
  },
  {
    addressLabel: "Демо · Коши",
    address: "Жилой массив Коши, Ашхабад",
    latitude: 37.9862,
    longitude: 58.3075,
    entrance: "1",
    floor: "2",
    apartment: "7",
  },
];

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
    throw new Error(
      `${method} ${path} failed (HTTP ${response.status}): ${
        Array.isArray(value?.message)
          ? value.message.join(", ")
          : (value?.message ?? "unknown error")
      }`,
    );
  }
  return value;
}

async function expectStatus(path, status, { token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status !== status) {
    throw new Error(
      `GET ${path} returned HTTP ${response.status}; expected ${status}`,
    );
  }
  return response.status;
}

async function login(phone) {
  const requested = await api("/auth/otp/request", {
    method: "POST",
    body: { phone },
  });
  if (!requested.devCode) {
    throw new Error(
      "The local courier demo requires the development console SMS provider.",
    );
  }
  return api("/auth/otp/verify", {
    method: "POST",
    body: { phone, code: requested.devCode },
  });
}

async function refreshSession(session) {
  return api("/auth/refresh", {
    method: "POST",
    body: { refreshToken: session.refreshToken },
  });
}

async function createCourier(adminToken, phone, firstName) {
  return api("/staff", {
    method: "POST",
    token: adminToken,
    body: {
      phone,
      role: "COURIER",
      firstName,
      lastName: "Демо-курьер",
    },
  });
}

async function createAssignedOrder({
  customerToken,
  adminToken,
  courierId,
  product,
  delivery,
  quantity,
}) {
  const item = {
    productId: product.id,
    quantity,
    ...(product.variants?.[0]?.id
      ? { variantId: product.variants[0].id }
      : {}),
  };
  let order = await api("/orders", {
    method: "POST",
    token: customerToken,
    body: { items: [item], ...delivery },
  });
  order = await api(`/orders/${order.id}/confirm-packing`, {
    method: "PATCH",
    token: adminToken,
    body: {
      checkedItemIds: order.items.map(({ id }) => id),
      version: order.version,
    },
  });
  return api(`/orders/${order.id}/assign-courier`, {
    method: "PATCH",
    token: adminToken,
    body: { courierId, version: order.version },
  });
}

async function publishLocation(session, point, recordedAt = new Date()) {
  return api("/tracking/me/location", {
    method: "PUT",
    token: session.accessToken,
    body: {
      ...point,
      accuracy: 7,
      speed: 6.5,
      recordedAt: recordedAt.toISOString(),
    },
  });
}

async function writeState(state) {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(statePath, 0o600);
}

async function readState() {
  return JSON.parse(await readFile(statePath, "utf8"));
}

function publicOrder(order) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    version: order.version,
    courierId: order.courierId,
    address: order.address,
  };
}

async function setup() {
  const run = String(Date.now() % 1_000_000).padStart(6, "0");
  const otherRun = String((Number(run) + 1) % 1_000_000).padStart(6, "0");
  const admin = await login("+99365000001");
  const firstCourierRecord = await createCourier(
    admin.accessToken,
    `+99365${run}`,
    "Аман",
  );
  const secondCourierRecord = await createCourier(
    admin.accessToken,
    `+99365${otherRun}`,
    "Мердан",
  );
  const firstCourier = await login(firstCourierRecord.phone);
  const secondCourier = await login(secondCourierRecord.phone);
  const firstCustomer = await login(`+99362${run}`);
  const secondCustomer = await login(`+99362${otherRun}`);
  const products = await api("/catalog/products");
  const product = products.find(({ isActive }) => isActive !== false) ?? products[0];
  if (!product?.id) {
    throw new Error("No active catalog product is available for demo orders.");
  }

  const orders = [];
  orders.push(
    await createAssignedOrder({
      customerToken: firstCustomer.accessToken,
      adminToken: admin.accessToken,
      courierId: firstCourier.user.id,
      product,
      delivery: deliveryStops[0],
      quantity: 1,
    }),
  );
  orders.push(
    await createAssignedOrder({
      customerToken: firstCustomer.accessToken,
      adminToken: admin.accessToken,
      courierId: firstCourier.user.id,
      product,
      delivery: deliveryStops[1],
      quantity: 2,
    }),
  );
  orders.push(
    await createAssignedOrder({
      customerToken: secondCustomer.accessToken,
      adminToken: admin.accessToken,
      courierId: secondCourier.user.id,
      product,
      delivery: deliveryStops[2],
      quantity: 1,
    }),
  );

  const recordedAt = new Date();
  await Promise.all([
    publishLocation(firstCourier, courierPaths[0][0], recordedAt),
    publishLocation(secondCourier, courierPaths[1][0], recordedAt),
  ]);

  const [firstRoute, secondRoute, dispatch, ownCustomerLocation] =
    await Promise.all([
      api("/orders/courier/route", { token: firstCourier.accessToken }),
      api("/orders/courier/route", { token: secondCourier.accessToken }),
      api("/tracking/dispatch", { token: admin.accessToken }),
      api(`/tracking/orders/${orders[0].id}/courier-location`, {
        token: firstCustomer.accessToken,
      }),
    ]);
  const crossCustomerStatus = await expectStatus(
    `/tracking/orders/${orders[2].id}/courier-location`,
    422,
    { token: firstCustomer.accessToken },
  );

  const state = {
    baseUrl,
    createdAt: new Date().toISOString(),
    moveStep: 0,
    admin,
    customers: [firstCustomer, secondCustomer],
    couriers: [firstCourier, secondCourier],
    orders,
  };
  await writeState(state);

  console.log(
    JSON.stringify(
      {
        statePath,
        couriers: [
          {
            id: firstCourier.user.id,
            name: "Аман Демо-курьер",
            activeOrderNumbers: orders.slice(0, 2).map(({ number }) => number),
            routingStatus: firstRoute.routingStatus,
            stopCount: firstRoute.stops.length,
            distanceMeters: firstRoute.route?.distanceMeters ?? null,
          },
          {
            id: secondCourier.user.id,
            name: "Мердан Демо-курьер",
            activeOrderNumbers: [orders[2].number],
            routingStatus: secondRoute.routingStatus,
            stopCount: secondRoute.stops.length,
            distanceMeters: secondRoute.route?.distanceMeters ?? null,
          },
        ],
        dispatchCourierCount: dispatch.couriers.length,
        customerOwnLocationVisible: ownCustomerLocation.location !== null,
        otherCustomersOrderStatus: crossCustomerStatus,
      },
      null,
      2,
    ),
  );
}

async function move() {
  const state = await readState();
  state.couriers = await Promise.all(state.couriers.map(refreshSession));
  const nextStep = (state.moveStep + 1) % courierPaths[0].length;
  const recordedAt = new Date();
  const locations = await Promise.all(
    state.couriers.map((courier, index) =>
      publishLocation(courier, courierPaths[index][nextStep], recordedAt),
    ),
  );
  state.moveStep = nextStep;
  await writeState(state);
  console.log(
    JSON.stringify(
      {
        moveStep: nextStep,
        locations: locations.map(({ location }, index) => ({
          courierId: state.couriers[index].user.id,
          latitude: location.latitude,
          longitude: location.longitude,
        })),
      },
      null,
      2,
    ),
  );
}

async function advance() {
  const index = Number(process.argv[3] ?? 0);
  const state = await readState();
  const storedOrder = state.orders[index];
  if (!storedOrder) throw new Error(`Demo order index ${index} does not exist.`);
  const courier = state.couriers.find(
    ({ user }) => user.id === storedOrder.courierId,
  );
  if (!courier) throw new Error("Assigned demo courier session was not found.");
  const refreshedCourier = await refreshSession(courier);
  state.couriers = state.couriers.map((session) =>
    session.user.id === refreshedCourier.user.id ? refreshedCourier : session,
  );
  const order = await api(`/orders/${storedOrder.id}`, {
    token: refreshedCourier.accessToken,
  });
  const nextStatus = {
    ASSIGNED_TO_COURIER: "OUT_FOR_DELIVERY",
    OUT_FOR_DELIVERY: "DELIVERED",
    DELIVERED: "CASH_RETURNED",
  }[order.status];
  if (!nextStatus) {
    throw new Error(`Order #${order.number} cannot advance from ${order.status}.`);
  }
  const updated = await api(`/orders/${order.id}/transition`, {
    method: "PATCH",
    token: refreshedCourier.accessToken,
    body: { status: nextStatus, version: order.version },
  });
  state.orders[index] = updated;
  await writeState(state);
  console.log(JSON.stringify({ order: publicOrder(updated) }, null, 2));
}

async function summary() {
  const state = await readState();
  state.admin = await refreshSession(state.admin);
  state.orders = await Promise.all(
    state.orders.map(({ id }) =>
      api(`/orders/${id}`, { token: state.admin.accessToken }),
    ),
  );
  await writeState(state);
  const [dispatch, ...routes] = await Promise.all([
    api("/tracking/dispatch", { token: state.admin.accessToken }),
    ...state.couriers.map((courier) =>
      api(`/orders/couriers/${courier.user.id}/route`, {
        token: state.admin.accessToken,
      }),
    ),
  ]);
  console.log(
    JSON.stringify(
      {
        moveStep: state.moveStep,
        orders: state.orders.map(publicOrder),
        couriers: state.couriers.map((courier, index) => ({
          id: courier.user.id,
          activeOrderNumbers:
            dispatch.couriers
              .find(({ id }) => id === courier.user.id)
              ?.activeOrders.map(({ number }) => number) ?? [],
          routingStatus: routes[index].routingStatus,
          stopCount: routes[index].stops.length,
          planId: routes[index].route?.planId ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

const commands = { setup, move, advance, summary };
if (!commands[command]) {
  throw new Error(
    `Unknown command ${command}; use setup, move, advance <order-index>, or summary.`,
  );
}

await commands[command]();
