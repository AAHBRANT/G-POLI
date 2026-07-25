import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "G-Políticas — AAHBRANT",
  description: "Gestão de políticas e documentos normativos",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
