export const FREE_SHIPPING_THRESHOLD_CENTS = 10000;
export const STANDARD_SHIPPING_CENTS = 800;

/** Calculate delivery fees for a priced cart. */
export function quoteShipping({ subtotalCents, payableCents }) {
  return payableCents > FREE_SHIPPING_THRESHOLD_CENTS
    ? 0
    : STANDARD_SHIPPING_CENTS;
}
