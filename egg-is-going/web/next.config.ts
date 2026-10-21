import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 에이전트 prompt.md / schema.json 을 서버에서 읽기 위해 파일 추적에 포함
  outputFileTracingIncludes: { "/**": ["./agents/**/*", "./fixtures/**/*"] },
  serverExternalPackages: ["docx"],
};

export default nextConfig;
