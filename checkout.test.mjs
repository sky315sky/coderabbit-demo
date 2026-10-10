import test from "node:test";
import assert from "node:assert/strict";
import { createCheckoutService } from "./checkout.mjs";
import { createInventory } from "./inventory.mjs";
import { createIdempotencyStore } from "./idempotency.mjs";
import { createFakePaymentGateway } from "./payments.mjs";
import { applyCoupon } from "./coupons.mjs";

const now = new Date("2030-01-01T00:00:00Z");
const coupon = { percent: 20, minSpendCents: 1000, expiresAt: "2030-02-01T00:00:00Z" };
function setup(stock = { BOOK: 10, PEN: 20 }) {
  const inventory = createInventory(stock);
  const payments = createFakePaymentGateway();
  const service = createCheckoutService({
    inventory, payments, idempotency: createIdempotencyStore(), clock: () => now,
  });
  return { inventory, payments, service };
}
function request(overrides = {}) {
  return {
    customerId: "demo-customer-a", idempotencyKey: "demo-request-1",
    items: [{ sku: "BOOK", priceCents: 2000, quantity: 2 }], ...overrides,
  };
}

test("ordinary checkout calculates subtotal, delivery and charge", async () => {
  const { service, inventory, payments } = setup();
  const order = await service.placeOrder(request());
  assert.equal(order.subtotalCents, 4000);
  assert.equal(order.shippingCents, 800);
  assert.equal(order.totalCents, 4800);
  assert.equal(inventory.getAvailable("BOOK"), 8);
  assert.equal(payments.getCharges().length, 1);
});
test("coupon discounts a below-threshold basket", async () => {
  const { service } = setup();
  const order = await service.placeOrder(request({ coupon }));
  assert.equal(order.discountCents, 800);
  assert.equal(order.totalCents, 4000);
});
test("large basket has free shipping", async () => {
  const { service } = setup();
  const order = await service.placeOrder(request({ items: [{ sku: "BOOK", priceCents: 20000, quantity: 1 }] }));
  assert.equal(order.shippingCents, 0);
});
test("same customer retry returns the same order and only charges once", async () => {
  const { service, payments } = setup();
  const first = await service.placeOrder(request());
  const second = await service.placeOrder(request());
  assert.equal(first.orderId, second.orderId);
  assert.equal(payments.getCharges().length, 1);
});
test("in-flight duplicates share one execution", async () => {
  const { service, payments, inventory } = setup();
  const orders = await Promise.all(Array.from({ length: 8 }, () => service.placeOrder(request())));
  assert.equal(new Set(orders.map(order => order.orderId)).size, 1);
  assert.equal(payments.getCharges().length, 1);
  assert.equal(inventory.getAvailable("BOOK"), 8);
});
test("same key with a changed request is rejected", async () => {
  const { service } = setup();
  await service.placeOrder(request());
  await assert.rejects(service.placeOrder(request({ coupon })), /IDEMPOTENCY_CONFLICT/);
});
test("payment failure releases stock and permits retry", async () => {
  const { service, inventory, payments } = setup();
  payments.declineOnce();
  await assert.rejects(service.placeOrder(request()), /PAYMENT_DECLINED/);
  assert.equal(inventory.getAvailable("BOOK"), 10);
  await service.placeOrder(request());
  assert.equal(inventory.getAvailable("BOOK"), 8);
});
test("insufficient stock on the first item is rejected before payment", async () => {
  const { service, inventory, payments } = setup({ BOOK: 1 });
  await assert.rejects(service.placeOrder(request()), /OUT_OF_STOCK/);
  assert.equal(inventory.getAvailable("BOOK"), 1);
  assert.equal(payments.getCharges().length, 0);
});
test("duplicate SKU quantities are combined", async () => {
  const { service, inventory } = setup({ BOOK: 3 });
  const item = { sku: "BOOK", priceCents: 1000, quantity: 2 };
  await assert.rejects(service.placeOrder(request({ items: [item, item] })), /OUT_OF_STOCK/);
  assert.equal(inventory.getAvailable("BOOK"), 3);
});
test("expired coupon rejects without reserving stock", async () => {
  const { service, inventory } = setup();
  await assert.rejects(service.placeOrder(request({ coupon: { ...coupon, expiresAt: now.toISOString() } })), /COUPON_EXPIRED/);
  assert.equal(inventory.getAvailable("BOOK"), 10);
});
test("coupon threshold is inclusive", () => {
  assert.equal(applyCoupon(1000, coupon, now).payableCents, 800);
});
test("invalid cart and overflowing amounts are rejected", async () => {
  const { service } = setup();
  await assert.rejects(service.placeOrder(request({ items: [] })), /EMPTY_CART/);
  await assert.rejects(service.placeOrder(request({ items: [{ sku: "BOOK", priceCents: -1, quantity: 1 }] })), /INVALID_CART_ITEM/);
  await assert.rejects(service.placeOrder(request({ items: [{ sku: "BOOK", priceCents: Number.MAX_SAFE_INTEGER, quantity: 2 }] })), /INVALID_CART_ITEM/);
});
