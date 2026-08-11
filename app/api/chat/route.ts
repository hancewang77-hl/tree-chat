import { proxyLegacyChat } from "@/src/runtime/nextProxy";

export async function POST(request: Request) {
  return proxyLegacyChat(request);
}
