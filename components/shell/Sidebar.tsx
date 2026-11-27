"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { MotionConfig, motion } from "motion/react";
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
  const [sobre, setSobre] = useState<string | null>(null);

  const item = (m: { nome: string; href: string; icone: string; futuro?: boolean; badge?: number }) => {
    const ativo = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
    const base = "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm";
    const ico = (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative shrink-0">
        <path d={m.icone} />
      </svg>
    );
    const badge = m.badge ? (
      <span
        aria-label={`${m.badge} pendente${m.badge > 1 ? "s" : ""}`}
        className="relative ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-marsala/90 px-1.5 text-[10px] font-semibold tabular-nums leading-none text-bege shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.16)] ring-1 ring-white/60"
      >
        {m.badge}
      </span>
    ) : null;
    if (m.futuro) {
      return (
        <span key={m.nome} title="Próximo incremento" className={`${base} cursor-not-allowed text-black/30`}>
          {ico}
          <span className="relative">{m.nome}</span>
          <span className="relative ml-auto rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">em breve</span>
        </span>
      );
    }
    return (
      <Link
        key={m.nome}
        href={m.href}
        onMouseEnter={() => setSobre(m.href)}
        onFocus={() => setSobre(m.href)}
        aria-current={ativo ? "page" : undefined}
        className={`${base} outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-black/50 ${
          ativo ? "font-semibold text-black" : "text-black/65 hover:text-black"
        }`}
      >
        {/* Lente de hover: vidro claro que acompanha o cursor entre os itens. */}
        {sobre === m.href && !ativo && (
          <motion.span
            layoutId="menu-lente"
            className="absolute inset-0 rounded-xl bg-white/40 ring-1 ring-white/70"
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
          />
        )}
        {/* Seletor: gota de Liquid Glass que escorrega até o item ativo, com
            mola solta (estica e assenta como líquido). */}
        {ativo && (
          <motion.span
            layoutId="menu-seletor"
            className="liquid liquid-bege absolute inset-0 rounded-xl"
            transition={{ type: "spring", stiffness: 300, damping: 24, mass: 0.9 }}
          />
        )}
        {ico}
        <span className="relative">{m.nome}</span>
        {badge}
      </Link>
    );
  };

  const rotulo = (texto: string) => (
    <div className="mb-1 mt-4 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40 first:mt-0">
      {texto}
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <aside className="vidro-bege relative flex w-64 flex-col justify-between text-black/80" onMouseLeave={() => setSobre(null)}>
        <div className="flex min-h-0 flex-1 flex-col">
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
          <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
            Administrativo
          </div>
          <div className="space-y-1">{admin.map(item)}</div>
        </div>
      </aside>
    </MotionConfig>
  );
}
