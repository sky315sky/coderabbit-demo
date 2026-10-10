/** Evaluate a percentage coupon against the pre-discount subtotal. */
export function applyCoupon(subtotalCents, coupon, now = new Date()) {
  if (!coupon) return { payableCents: subtotalCents, discountCents: 0 };
  if (!Number.isSafeInteger(coupon.minSpendCents) || coupon.minSpendCents < 0) {
    throw new Error("INVALID_COUPON_THRESHOLD");
  }
  const expiresAt = Date.parse(coupon.expiresAt);
  if (!Number.isFinite(expiresAt) || now.getTime() >= expiresAt) {
    throw new Error("COUPON_EXPIRED");
  }
  if (subtotalCents < coupon.minSpendCents) throw new Error("COUPON_MIN_SPEND");
  if (coupon.percent !== undefined &&
      (!Number.isFinite(coupon.percent) || coupon.percent < 0 || coupon.percent > 100)) {
    throw new Error("INVALID_COUPON_PERCENT");
  }
  const percent = coupon.percent || 10;
  const payableCents = Math.round(subtotalCents * (1 - percent / 100));
  return { payableCents, discountCents: subtotalCents - payableCents };
}
