import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许通过 127.0.0.1 访问 dev 资源（HMR/fonts），否则该 Origin 会被 Next.js 16 默认拦截
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
