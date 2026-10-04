import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
const storage = new Map();
globalThis.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
globalThis.window = { dispatchEvent: () => undefined };
const { addToBasket, readBasket, writeBasket } = await import("../src/entities/cart.ts");
beforeEach(() => storage.clear());
test("one cafe remains in the basket and switching cafes starts a fresh basket", () => {
  addToBasket("cafe-a", "Cafe A", { productId: "a", name: "A", unitPrice: 25, quantity: 1 });
  addToBasket("cafe-a", "Cafe A", { productId: "a", name: "A", unitPrice: 25, quantity: 1 });
  assert.equal(readBasket().lines[0].quantity, 2);
  assert.equal(addToBasket("cafe-b", "Cafe B", { productId: "b", name: "B", unitPrice: 30, quantity: 1 }).switched, true);
  assert.deepEqual(readBasket().lines.map((line) => line.productId), ["b"]);
  writeBasket(null); assert.equal(readBasket(), null);
});
test("malformed browser storage cannot break checkout", () => { storage.set("sacakly.web.basket", "{bad"); assert.equal(readBasket(), null); });
