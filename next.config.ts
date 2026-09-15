import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
