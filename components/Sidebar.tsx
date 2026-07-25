"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "@/components/Brand";

const modulos = [
  { nome: "Painel", href: "/", icone: "M3 12l9-9 9 9M5 10v10h14V10" },
  { nome: "Catálogo de Normas", href: "/catalogo", icone: "M4 5h16M4 12h16M4 19h10" },
  { nome: "Publicação", href: "/publicacao", icone: "M5 13l4 4L19 7" },
  { nome: "Busca", href: "/busca", icone: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z" },
];

const admin = [
  { nome: "Administração", href: "/admin", icone: "M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2m12 0h2M12 4v2m0 12v2" },
  { nome: "Suporte Inteligente", href: "/suporte", icone: "M8 10h8M8 14h5M21 12a9 9 0 11-3.5-7.1L21 3v9z", futuro: true },
];

export default function Sidebar() {
  const pathname = usePathname();

  const item = (m: { nome: string; href: string; icone: string; futuro?: boolean }) => {
    const ativo = m.href === "/" ? pathname === "/" : pathname.startsWith(m.href);
    const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition";
    const ico = (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d={m.icone} />
      </svg>
    );
    if (m.futuro) {
      return (
        <span key={m.nome} title="Próximo incremento" className={`${base} cursor-not-allowed text-white/35`}>
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
        className={`${base} ${ativo ? "bg-white/15 font-medium text-white shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
      >
        {ico}
        {m.nome}
      </Link>
    );
  };

  return (
    <aside className="flex w-64 flex-col justify-between bg-gradient-to-b from-marsala to-marsala-800 text-white">
      <div>
        <div className="border-b border-white/10 px-5 py-5">
          <Brand size="md" invertido />
        </div>
        <nav className="mt-5 space-y-1 px-3">{modulos.map(item)}</nav>
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
