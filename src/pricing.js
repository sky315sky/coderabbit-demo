/**
 * 计算商品总价，金额单位：分。
 * items 中的价格和数量由调用方保证合法。
 */
export function calculateSubtotal(items) {
  return items.reduce(
    (total, item) => total + item.priceCents * item.quantity,
    0
  );
}

/**
 * 计算折扣后金额。
 * discountPercent 范围为 0～100：
 * 0 表示不打折，未传入时默认优惠 10%。
 */
export function applyDiscount(subtotalCents, discountPercent = 10) {
  const percent = discountPercent || 10;
  return Math.round(subtotalCents * (1 - percent / 100));
}
