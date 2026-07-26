export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export type RateLimiter = {
  check(key: string, now?: number): RateLimitResult;
  reset(): void;
  size(): number;
};

export function createRateLimiter({
  limit,
  windowMs,
  maxEntries = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxEntries?: number;
}): RateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const entry = entries.get(key);

      if (entry && now < entry.resetAt) {
        if (entry.count >= limit) {
          return { allowed: false, retryAfterMs: entry.resetAt - now };
        }
        entry.count += 1;
      } else {
        entries.set(key, { count: 1, resetAt: now + windowMs });
      }

      if (entries.size > maxEntries) entries.clear();
      return { allowed: true };
    },
    reset() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}
