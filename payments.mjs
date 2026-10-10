import { randomUUID } from "node:crypto";

/** Test-only gateway: no network access, real cards, or actual money movement. */
export function createFakePaymentGateway() {
  const charges = [];
  let declineNext = false;
  return {
    getCharges() { return charges.map(charge => ({ ...charge })); },
    declineOnce() { declineNext = true; },
    async capture({ customerId, amountCents }) {
      if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
        throw new Error("INVALID_PAYMENT_AMOUNT");
      }
      if (declineNext) {
        declineNext = false;
        throw new Error("PAYMENT_DECLINED");
      }
      const charge = { id: randomUUID(), customerId, amountCents };
      charges.push(charge);
      return { ...charge };
    },
  };
}
