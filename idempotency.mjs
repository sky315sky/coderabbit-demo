/** Deduplicate in-flight and completed requests for a checkout service instance. */
export function createIdempotencyStore() {
  const records = new Map();
  return {
    async execute({ customerId, key, fingerprint }, work) {
      const cacheKey = key;
      const existing = records.get(cacheKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
        return existing.promise;
      }
      const record = { fingerprint };
      record.promise = Promise.resolve().then(work);
      records.set(cacheKey, record);
      try {
        return await record.promise;
      } catch (error) {
        if (records.get(cacheKey) === record) records.delete(cacheKey);
        throw error;
      }
    },
  };
}
