"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "@/components/shell/Brand";
import { TIPOS_DOCUMENTO } from "@/lib/constants";
import { usePendencias } from "@/lib/hooks/usePendencias";

const painel = { nome: "Painel", href: "/", icone: "M3 12l9-9 9 9M5 10v10h14V10" };

// v3: um item de menu por tipo de documento, cada um com sua seção própria
// (mesmo padrão que "Catálogo de Normas" já tinha). Política mantém a rota
// /catalogo, que já existia; os outros 7 vão para /tipos/[tipo] — página
// genérica, um arquivo só. Ícone único de documento para os 8 (evita 8 ícones
// sob medida sem necessidade real ainda).
const ICONE_DOCUMENTO = "M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M9 13h6M9 17h6";
const documentos = TIPOS_DOCUMENTO.map((t) => ({
  nome: t.rotuloPlural,
  href: t.valor === "politica" ? "/catalogo" : `/tipos/${t.valor}`,
  icone: ICONE_DOCUMENTO,
  valor: t.valor,
}));

const ferramentas = [
  { nome: "Publicação", href: "/publicacao", icone: "M5 13l4 4L19 7" },
  { nome: "Busca", href: "/busca", icone: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z" },
];

const admin = [
  { nome: "Administração", href: "/admin", icone: "M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2m12 0h2M12 4v2m0 12v2" },
  { nome: "Suporte Inteligente", href: "/suporte", icone: "M8 10h8M8 14h5M21 12a9 9 0 11-3.5-7.1L21 3v9z", futuro: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { total, porTipo, carregando } = usePendencias();

  const item = (m: { nome: string; href: string; icone: string; futuro?: boolean; badge?: number }) => {
    const ativo = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
    // Indicador de item ativo é uma barra lateral (borda), não preenchimento de
    // fundo — mais discreto, mesmo padrão pros itens normais e o de admin.
    const base = "flex items-center gap-3 rounded-md border-l-2 px-3 py-1.5 text-sm transition";
    const ico = (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d={m.icone} />
      </svg>
    );
    const badge = m.badge ? (
      <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {m.badge}
      </span>
    ) : null;
    if (m.futuro) {
      return (
        <span key={m.nome} title="Próximo incremento" className={`${base} cursor-not-allowed border-transparent text-white/35`}>
          {ico}
          {m.nome}
          <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">em breve</span>
        </span>
      );
    }
    return (
      <Link
        key={m.nome}
        href={m.href}
        className={`${base} ${ativo ? "border-bege bg-white/10 font-medium text-white" : "border-transparent text-white/75 hover:bg-white/5 hover:text-white"}`}
      >
        {ico}
        {m.nome}
        {badge}
      </Link>
    );
  };

  const rotulo = (texto: string) => (
    <div className="mb-1 mt-4 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-bege/70 first:mt-0">
      {texto}
    </div>
  );

  return (
    <aside className="flex w-64 flex-col justify-between bg-gradient-to-b from-marsala to-marsala-800 text-white">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <Brand size="md" invertido />
        </div>
        <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {item({ ...painel, badge: !carregando && total > 0 ? total : undefined })}
          {rotulo("Documentos")}
          <div className="space-y-1">
            {documentos.map((d) => item({ ...d, badge: !carregando && porTipo[d.valor] > 0 ? porTipo[d.valor] : undefined }))}
          </div>
          {rotulo("Ferramentas")}
          <div className="space-y-1">{ferramentas.map(item)}</div>
        </nav>
      </div>
      <div className="px-3 pb-5">
        <div className="mb-1 px-3 text-[10px] font-medium uppercase tracking-[0.14em] text-bege/70">
          Administrativo
        </div>
        <div className="space-y-1">{admin.map(item)}</div>
      </div>
    </aside>
  );
}
