import type { Metadata } from "next";
import { Anta } from "next/font/google";
import "./globals.css";
import TeamsFrame from "@/components/TeamsFrame";
import FundoEfeitos from "@/components/FundoEfeitos";

const anta = Anta({ weight: "400", subsets: ["latin"], variable: "--font-anta", display: "swap" });

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
    <html lang="pt-BR" data-visual="a" className={anta.variable}>
      <body>
        <FundoEfeitos />
        <TeamsFrame />
        {children}
      </body>
    </html>
  );
}
