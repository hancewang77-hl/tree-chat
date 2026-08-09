import { describe, expect, test } from "vitest";
import { resolveLandingPresentation } from "./siteProfile";

const hosts = {
  publicHost: "tree-chat.example.workers.dev",
  competitionHost: "treechat.tech",
};

describe("landing site profile", () => {
  test("serves the public presentation only on the exact configured public host", () => {
    const profile = resolveLandingPresentation("TREE-CHAT.EXAMPLE.WORKERS.DEV:443", hosts);

    expect(profile.id).toBe("public");
    expect(profile.repositoryUrl).toBe("https://github.com/hancewang77-hl/tree-chat");
    expect(profile.licenseUrl).toBe("https://github.com/hancewang77-hl/tree-chat#license");
    expect(profile.repositoryLabel).toBe("GitHub");
    expect(profile.licenseLabel).toBe("MIT License");
    expect(profile.robots).toEqual({ index: true, follow: true });
  });

  test("normalizes a trailing DNS dot without weakening exact matching", () => {
    expect(resolveLandingPresentation("tree-chat.example.workers.dev.", hosts).id).toBe("public");
    expect(resolveLandingPresentation("tree-chat.example.workers.dev.evil.test", hosts).id).toBe("competition");
  });

  test("uses the anonymous presentation on the configured competition host", () => {
    const profile = resolveLandingPresentation("treechat.tech", hosts);

    expect(profile.id).toBe("competition");
    expect(profile.repositoryUrl).toBeNull();
    expect(profile.licenseUrl).toBeNull();
    expect(profile.repositoryLabel).toBeNull();
    expect(profile.licenseLabel).toBeNull();
    expect(profile.canopyFact).toEqual({
      label: "Local-first",
      text: "浏览器本地工作区",
    });
    expect(profile.robots).toEqual({ index: false, follow: false });
  });

  test("fails closed to the anonymous profile for missing, malformed, or unknown hosts", () => {
    expect(resolveLandingPresentation(null, hosts).id).toBe("competition");
    expect(resolveLandingPresentation("", hosts).id).toBe("competition");
    expect(resolveLandingPresentation("https://tree-chat.example.workers.dev", hosts).id).toBe("competition");
    expect(resolveLandingPresentation("unknown.example", hosts).id).toBe("competition");
    expect(resolveLandingPresentation("tree-chat.example.workers.dev@evil.test", hosts).id).toBe("competition");
  });

  test("fails closed when the public host configuration is missing", () => {
    expect(resolveLandingPresentation("tree-chat.example.workers.dev", {
      publicHost: undefined,
      competitionHost: "treechat.tech",
    }).id).toBe("competition");
  });

  test("rejects colliding public and competition host configuration", () => {
    expect(() => resolveLandingPresentation("treechat.tech", {
      publicHost: "TREECHAT.TECH.",
      competitionHost: "treechat.tech",
    })).toThrow(/must be different/);
  });
});
