import type { Metadata } from "next";
import { headers } from "next/headers";
import { LandingPage } from "@/src/components/landing/LandingPage";
import { resolveLandingPresentation } from "@/src/lib/siteProfile";

async function getLandingPresentation() {
  const requestHeaders = await headers();
  return resolveLandingPresentation(requestHeaders.get("host"), {
    publicHost: process.env.TREECHAT_PUBLIC_HOST,
    competitionHost: process.env.TREECHAT_COMPETITION_HOST,
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const presentation = await getLandingPresentation();
  return { robots: presentation.robots };
}

export default async function Page() {
  return <LandingPage profile={await getLandingPresentation()} />;
}
