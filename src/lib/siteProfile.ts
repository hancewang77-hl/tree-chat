export type SiteProfileId = "public" | "competition";

export type LandingPresentation = Readonly<{
  id: SiteProfileId;
  repositoryUrl: string | null;
  licenseUrl: string | null;
  repositoryLabel: string | null;
  licenseLabel: string | null;
  canopyFact: Readonly<{
    label: string;
    text: string;
  }>;
  robots: Readonly<{
    index: boolean;
    follow: boolean;
  }>;
}>;

type SiteHosts = Readonly<{
  publicHost: string | undefined;
  competitionHost: string | undefined;
}>;

const REPOSITORY_URL = "https://github.com/hancewang77-hl/tree-chat";

const COMPETITION_PRESENTATION: LandingPresentation = {
  id: "competition",
  repositoryUrl: null,
  licenseUrl: null,
  repositoryLabel: null,
  licenseLabel: null,
  canopyFact: {
    label: "Local-first",
    text: "浏览器本地工作区",
  },
  robots: {
    index: false,
    follow: false,
  },
};

const PUBLIC_PRESENTATION: LandingPresentation = {
  id: "public",
  repositoryUrl: REPOSITORY_URL,
  licenseUrl: `${REPOSITORY_URL}#license`,
  repositoryLabel: "GitHub",
  licenseLabel: "MIT License",
  canopyFact: {
    label: "Open Source",
    text: "MIT License · GitHub",
  },
  robots: {
    index: true,
    follow: true,
  },
};

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim().toLowerCase();
  if (!candidate || /[\s/@?#]/.test(candidate)) return null;

  const portSeparator = candidate.lastIndexOf(":");
  if (portSeparator >= 0) {
    const port = candidate.slice(portSeparator + 1);
    if (!/^\d+$/.test(port)) return null;
    candidate = candidate.slice(0, portSeparator);
  }

  candidate = candidate.replace(/\.$/, "");
  if (!candidate || !/^[a-z0-9.-]+$/.test(candidate)) return null;
  return candidate;
}

export function resolveLandingPresentation(
  requestHost: string | null,
  hosts: SiteHosts,
): LandingPresentation {
  const publicHost = normalizeHost(hosts.publicHost);
  const competitionHost = normalizeHost(hosts.competitionHost);
  if (publicHost && competitionHost && publicHost === competitionHost) {
    throw new Error("TREECHAT_PUBLIC_HOST and TREECHAT_COMPETITION_HOST must be different");
  }

  const host = normalizeHost(requestHost);
  return publicHost && host === publicHost
    ? PUBLIC_PRESENTATION
    : COMPETITION_PRESENTATION;
}
