import type { NextConfig } from "next";

// Carimbo de versão do rodapé do menu (padrão dos sistemas da Lube): dia do build e o
// commit que a Vercel injeta. É o jeito de saber, olhando a tela, se o deploy novo já entrou.
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);
const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer", "pdf-parse"],
  eslint: { ignoreDuringBuilds: true },
  env: { NEXT_PUBLIC_VERSAO: `${dia} (${commit})` },
  // abre dentro do Painel Lube; nenhum outro site consegue mostrar o Gestão TI
  async headers() {
    return [{
      source: "/:path*",
      headers: [{
        key: "Content-Security-Policy",
        value: "frame-ancestors 'self' https://painel-lube-distribuidora.vercel.app",
      }],
    }];
  },
};

export default nextConfig;
