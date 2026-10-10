import { randomUUID } from "node:crypto";
import { calculateSubtotal } from "./src/pricing.js";
import { applyCoupon } from "./coupons.mjs";
import { quoteShipping } from "./shipping.mjs";

function validate(command) {
  if (!command || typeof command.customerId !== "string" || !command.customerId.trim()) {
    throw new Error("INVALID_CUSTOMER");
  }
  if (typeof command.idempotencyKey !== "string" || !command.idempotencyKey.trim()) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
  if (!Array.isArray(command.items) || command.items.length === 0) throw new Error("EMPTY_CART");
  for (const item of command.items) {
    if (!item || typeof item.sku !== "string" || !item.sku.trim() ||
        !Number.isSafeInteger(item.priceCents) || item.priceCents < 0 ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isSafeInteger(item.priceCents * item.quantity)) {
      throw new Error("INVALID_CART_ITEM");
    }
  }
  if (!Number.isSafeInteger(calculateSubtotal(command.items))) throw new Error("TOTAL_OVERFLOW");
}

/** Compose calculation, reservation, idempotency and fake payment adapters. */
export function createCheckoutService({ inventory, idempotency, payments, clock = () => new Date() }) {
  return {
    async placeOrder(input) {
      const command = structuredClone(input);
      validate(command);
      const { customerId, idempotencyKey, items, coupon } = command;
      const fingerprint = JSON.stringify({ items, coupon: coupon ?? null });
      return idempotency.execute({ customerId, key: idempotencyKey, fingerprint }, async () => {
        const subtotalCents = calculateSubtotal(items);
        const { payableCents, discountCents } = applyCoupon(subtotalCents, coupon, clock());
        const shippingCents = quoteShipping({ subtotalCents, payableCents });
        const totalCents = payableCents + shippingCents;
        if (!Number.isSafeInteger(totalCents)) throw new Error("TOTAL_OVERFLOW");
        const reservationId = inventory.reserve(items);
        try {
          const payment = await payments.capture({ customerId, amountCents: totalCents });
          inventory.commit(reservationId);
          return Object.freeze({
            orderId: randomUUID(), customerId, paymentId: payment.id,
            subtotalCents, discountCents, shippingCents, totalCents,
            status: "paid",
          });
        } catch (error) {
          inventory.release(reservationId);
          throw error;
        }
      });
    },
  };
}
