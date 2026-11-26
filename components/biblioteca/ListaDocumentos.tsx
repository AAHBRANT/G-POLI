"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBiblioteca } from "./PainelBiblioteca";

export type LinhaBiblioteca = {
  id: string;
  codigo: string | null;
  titulo: string;
  tipoRotulo: string;
  areaNome: string;
  revisao: number;
  /** "vigente desde 12/05/2026" ou "criada em 12/05/2026" — já formatado. */
  datado: string;
  estado: string;
  estadoRotulo: string;
  estadoCor: string;
  /** Alertas de qualidade (só para quem vê: revisão vencida/vencendo, sem superior). */
  alertas: { texto: string; grave: boolean }[];
  classificacaoRotulo: string;
  classificacaoCor: string;
  pendente: boolean;
};

// Lista de documentos. O momento de destaque da tela: um realce bege "desliza"
// de linha em linha acompanhando o cursor (ou o foco do teclado), a seta da
// linha avança, e ao filtrar as linhas que permanecem se reposicionam com mola
// enquanto as novas entram em cascata e as que saem se dissolvem.
export default function ListaDocumentos({ itens, vazio }: { itens: LinhaBiblioteca[]; vazio?: ReactNode }) {
  const { pendente: atualizando } = useBiblioteca();
  const [destaque, setDestaque] = useState<string | null>(null);

  if (itens.length === 0 && vazio) return <>{vazio}</>;

  return (
    <ul
      onMouseLeave={() => setDestaque(null)}
      className={`liquid relative rounded-2xl p-2 transition-opacity duration-200 ${atualizando ? "opacity-60" : "opacity-100"}`}
      aria-busy={atualizando}
    >
      <AnimatePresence initial mode="popLayout">
        {itens.map((d, i) => (
          <motion.li
            key={d.id}
            layout="position"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 32,
              opacity: { duration: 0.25 },
              delay: Math.min(i, 8) * 0.035,
            }}
            onMouseEnter={() => setDestaque(d.id)}
            onFocus={() => setDestaque(d.id)}
            onBlur={() => setDestaque(null)}
            className="relative"
          >
            {destaque === d.id && (
              <motion.span
                layoutId="destaque-linha"
                className="liquid liquid-bege absolute inset-0 rounded-xl"
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
              />
            )}
            <Link
              href={`/catalogo/${d.id}`}
              className="group relative flex flex-col gap-3 rounded-xl px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-black/50 sm:flex-row sm:items-center sm:gap-5"
            >
              <span className="w-fit shrink-0 rounded-md bg-bege/70 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-tight text-black/80 sm:w-32 sm:text-center">
                {d.codigo ?? "sem código"}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug text-black/85 transition-colors group-hover:text-black">
                  {d.titulo}
                </span>
                <span className="mt-1 block text-xs text-black/50">
                  {d.tipoRotulo} · {d.areaNome} · Rev. {d.revisao} · {d.datado}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-3">
                {d.pendente && (
                  <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                    <span className="pulso-ponto block h-1.5 w-1.5 rounded-full bg-amber-600" />
                    Leitura pendente
                  </span>
                )}
                {d.alertas.map((a) => (
                  <span key={a.texto} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${a.grave ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                    {a.texto}
                  </span>
                ))}
                {d.estado !== "publicada" && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${d.estadoCor}`}>{d.estadoRotulo}</span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${d.classificacaoCor}`}>
                  {d.classificacaoRotulo}
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="hidden -translate-x-1 text-black opacity-0 transition duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block"
                  aria-hidden
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
