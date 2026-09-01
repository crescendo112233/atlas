import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ali-oss", "@alicloud/credentials", "postgres"],
};

export default nextConfig;
