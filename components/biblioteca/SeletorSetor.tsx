"use client";

import { hrefBiblioteca, type ParamsBiblioteca } from "@/lib/politica/biblioteca";
import { useBiblioteca } from "./PainelBiblioteca";

// Filtro por setor: lista suspensa em vidro, mesma navegação ao vivo das pílulas.
export default function SeletorSetor({
  base,
  params,
  setores,
}: {
  base: string;
  params: ParamsBiblioteca;
  setores: { id: string; nome: string; total: number }[];
}) {
  const { navegar } = useBiblioteca();
  return (
    <label className="liquid relative flex h-11 border border-black/10 shrink-0 items-center gap-2 rounded-2xl px-3.5 text-[13px] font-semibold text-black/70">
      <span className="text-black/45">Setor</span>
      <select
        value={params.areaId}
        onChange={(e) => navegar(hrefBiblioteca(base, params, { areaId: e.target.value }))}
        aria-label="Filtrar por setor"
        className="cursor-pointer appearance-none bg-transparent pr-5 text-black/85 outline-none focus-visible:ring-2 focus-visible:ring-black/50"
      >
        <option value="">Todos</option>
        {setores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome} ({s.total})
          </option>
        ))}
      </select>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="pointer-events-none absolute right-3.5 text-black/50" aria-hidden>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
}
