"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tipoDocumento, tipoDocumentoValido } from "@/lib/constants";

type Trilha = { nome: string; href?: string };

// Rotas de primeiro nível com rótulo fixo. /catalogo e /tipos/[tipo] usam
// TIPOS_DOCUMENTO (mesma fonte da Sidebar) em vez de duplicar rótulo aqui.
const ROTAS_FIXAS: Record<string, string> = {
  "/publicacao": "Publicação",
  "/busca": "Busca",
  "/admin": "Administração",
  "/suporte": "Suporte Inteligente",
};

function trilhaDe(pathname: string): Trilha[] {
  if (pathname === "/") return [{ nome: "Início" }];

  const trilha: Trilha[] = [{ nome: "Início", href: "/" }];
  const partes = pathname.split("/").filter(Boolean);

  if (partes[0] === "catalogo") {
    trilha.push({ nome: "Políticas", href: partes.length > 1 ? "/catalogo" : undefined });
    return trilha;
  }
  if (partes[0] === "tipos" && tipoDocumentoValido(partes[1] ?? "")) {
    const info = tipoDocumento(partes[1]!);
    trilha.push({ nome: info.rotuloPlural, href: partes.length > 2 ? `/tipos/${info.valor}` : undefined });
    return trilha;
  }
  if (partes[0] === "admin") {
    trilha.push({ nome: "Administração", href: partes.length > 1 ? "/admin" : undefined });
    if (partes[1] === "auditoria") trilha.push({ nome: "Auditoria" });
    return trilha;
  }
  if (ROTAS_FIXAS[pathname]) {
    trilha.push({ nome: ROTAS_FIXAS[pathname] });
    return trilha;
  }
  return trilha;
}

export default function Breadcrumb() {
  const pathname = usePathname();
  const trilha = trilhaDe(pathname);

  return (
    <nav className="flex items-center gap-1.5 text-xs text-black/50">
      {trilha.map((t, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-black/25">/</span>}
          {t.href ? (
            <Link href={t.href} className="hover:text-marsala hover:underline">{t.nome}</Link>
          ) : (
            <span className={i === trilha.length - 1 ? "font-medium text-marsala" : ""}>{t.nome}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
