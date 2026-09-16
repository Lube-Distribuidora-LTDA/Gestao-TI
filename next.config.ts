import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "pdf-parse"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
