"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { hrefBiblioteca, type ParamsBiblioteca } from "@/lib/politica/biblioteca";
import { useBiblioteca } from "./PainelBiblioteca";
import NumeroAnimado from "./NumeroAnimado";

export type OpcaoPilula = { valor: string; rotulo: string; total: number };

// Abas em pílula com fundo deslizante (layoutId compartilhado): ao escolher, a
// pílula bege "viaja" até a nova opção com mola, e a lista abaixo atualiza sem
// recarregar. Serve a qualquer filtro de valor único (tipo, estado). Em tela
// pequena rola na horizontal.
export default function FiltroPilulas({
  base,
  params,
  chave,
  opcoes,
  rotuloTodos = "Todos",
  mostrarTotalTodos = true,
  aria,
}: {
  base: string;
  params: ParamsBiblioteca;
  chave: "tipo" | "estado" | "alerta";
  opcoes: OpcaoPilula[];
  rotuloTodos?: string;
  mostrarTotalTodos?: boolean;
  aria: string;
}) {
  const { navegar } = useBiblioteca();
  const atual = params[chave] as string;
  const [ativo, setAtivo] = useState<string>(atual);
  useEffect(() => setAtivo(atual), [atual]);

  const todas: OpcaoPilula[] = [{ valor: "", rotulo: rotuloTodos, total: mostrarTotalTodos ? opcoes.reduce((s, o) => s + o.total, 0) : -1 }, ...opcoes];
  const hrefDe = (valor: string) => hrefBiblioteca(base, params, { [chave]: valor } as Partial<ParamsBiblioteca>);

  return (
    <nav aria-label={aria} className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="liquid relative inline-flex min-w-full gap-1 rounded-2xl p-1">
        {todas.map((o) => {
          const selecionado = ativo === o.valor;
          return (
            <li key={o.valor || "todos"} className="shrink-0">
              <Link
                href={hrefDe(o.valor)}
                scroll={false}
                aria-current={selecionado ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  setAtivo(o.valor);
                  navegar(hrefDe(o.valor));
                }}
                className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-black/50 ${
                  selecionado ? "text-black" : "text-black/60 hover:text-black"
                }`}
              >
                {selecionado && (
                  <motion.span
                    layoutId={`pilula-${chave}`}
                    className="liquid liquid-bege absolute inset-0 rounded-xl"
                    transition={{ type: "spring", stiffness: 300, damping: 24, mass: 0.9 }}
                  />
                )}
                <span className="relative">{o.rotulo}</span>
                {o.total >= 0 && (
                <span
                  className={`relative rounded-full px-1.5 py-0.5 text-[11px] leading-none transition-colors ${
                    selecionado ? "bg-black/10 text-black" : "bg-black/[0.06] text-black/50"
                  }`}
                >
                  <NumeroAnimado valor={o.total} />
                </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
