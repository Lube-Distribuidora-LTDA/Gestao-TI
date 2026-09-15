import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestão de TI · Lube Distribuidora",
  description:
    "Controle de contas, notas fiscais, custos e chamados do departamento de TI da Lube Distribuidora.",
};

export const viewport: Viewport = {
  themeColor: "#0e1742",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
