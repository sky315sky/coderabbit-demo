/** Process-local stock adapter, shared by checkout requests. */
export function createInventory(initialStock) {
  const available = new Map(Object.entries(initialStock));
  for (const count of available.values()) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("INVALID_STOCK");
  }
  const active = new Map();
  let sequence = 0;

  return {
    getAvailable(sku) { return available.get(sku) ?? 0; },
    reserve(items) {
      const required = new Map();
      for (const { sku, quantity } of items) {
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
          throw new Error("INVALID_QUANTITY");
        }
        const total = (required.get(sku) ?? 0) + quantity;
        if (!Number.isSafeInteger(total)) throw new Error("QUANTITY_OVERFLOW");
        required.set(sku, total);
      }
      for (const [sku, quantity] of required) {
        const count = available.get(sku) ?? 0;
        if (count < quantity) throw new Error(`OUT_OF_STOCK:${sku}`);
        available.set(sku, count - quantity);
      }
      const id = `reservation-${++sequence}`;
      active.set(id, required);
      return id;
    },
    release(id) {
      const required = active.get(id);
      if (!required) return;
      for (const [sku, quantity] of required) {
        available.set(sku, available.get(sku) + quantity);
      }
      active.delete(id);
    },
    commit(id) {
      if (!active.delete(id)) throw new Error("UNKNOWN_RESERVATION");
    },
  };
}
