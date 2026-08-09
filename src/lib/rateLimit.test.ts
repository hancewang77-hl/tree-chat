import { describe, expect, test } from "vitest";
import { createRateLimiter, getClientIp } from "./rateLimit";

describe("getClientIp", () => {
  test("prefers the first x-forwarded-for hop, then x-real-ip, then 'unknown'", () => {
    const request = (headers: Record<string, string>) =>
      new Request("http://localhost/api", { headers });

    expect(
      getClientIp(request({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" })),
    ).toBe("1.2.3.4");
    expect(getClientIp(request({ "x-forwarded-for": " 1.2.3.4 " }))).toBe("1.2.3.4");
    expect(getClientIp(request({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(getClientIp(request({}))).toBe("unknown");
  });
});

describe("createRateLimiter", () => {
  test("allows requests until the per-key window limit is reached", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });

    expect(limiter.check("ip", 100)).toEqual({ allowed: true });
    expect(limiter.check("ip", 200)).toEqual({ allowed: true });
    expect(limiter.check("ip", 300)).toEqual({ allowed: false, retryAfterMs: 800 });
  });

  test("isolates keys and resets after the time window", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });

    expect(limiter.check("a", 100).allowed).toBe(true);
    expect(limiter.check("b", 100).allowed).toBe(true);
    expect(limiter.check("a", 101).allowed).toBe(false);
    expect(limiter.check("a", 1_101).allowed).toBe(true);
  });

  test("can be reset by route tests", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 });
    limiter.check("ip", 100);

    expect(limiter.size()).toBe(1);
    limiter.reset();
    expect(limiter.size()).toBe(0);
    expect(limiter.check("ip", 200).allowed).toBe(true);
  });
});
