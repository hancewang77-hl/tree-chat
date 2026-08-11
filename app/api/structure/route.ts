import { proxyLegacyStructure } from "@/src/runtime/nextProxy";

export async function POST(request: Request) {
  return proxyLegacyStructure(request);
}
