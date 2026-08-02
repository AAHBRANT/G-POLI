"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarConsorcio, renomearConsorcio, alternarConsorcioAtivo } from "@/app/(shell)/admin/consorcio-actions";

type Consorcio = { id: string; nome: string; ativo: boolean };

export default function GerenciarConsorcios({ consorcios }: { consorcios: Consorcio[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pend, iniciar] = useTransition();

  function agir(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Falha.");
    });
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white shadow-card">
      <div className="border-b border-black/5 px-4 py-3">
        <span className="text-sm font-semibold text-black/80">Consórcios ({consorcios.length})</span>
      </div>
      <div className="px-4 py-3">
        <div className="mb-3 flex gap-2">
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo consórcio (ex.: Rodovia X)" className="h-10 flex-1 rounded border border-black/15 px-3 text-sm" />
          <button onClick={() => { if (novo.trim()) { agir(() => criarConsorcio(novo)); setNovo(""); } }} disabled={pend}
            className="h-10 rounded-md bg-marsala px-3 text-xs font-medium text-white hover:bg-marsala-600 disabled:opacity-60">
            + Adicionar
          </button>
        </div>
        {erro && <p className="mb-2 text-xs text-red-600">{erro}</p>}
        <ul className="divide-y divide-black/5">
          {consorcios.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
              <input
                defaultValue={c.nome}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nome) agir(() => renomearConsorcio(c.id, v)); }}
                className="flex-1 rounded border border-transparent px-2 py-1 hover:border-black/10 focus:border-marsala"
              />
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.ativo ? "bg-emerald-50 text-emerald-700" : "bg-black/10 text-black/50"}`}>
                {c.ativo ? "Ativo" : "Inativo"}
              </span>
              <button onClick={() => agir(() => alternarConsorcioAtivo(c.id, !c.ativo))} disabled={pend}
                className="rounded border border-black/15 px-2 py-1 text-[11px] text-black/70 hover:bg-black/5 disabled:opacity-60">
                {c.ativo ? "Desativar" : "Ativar"}
              </button>
            </li>
          ))}
          {consorcios.length === 0 && <li className="py-3 text-center text-xs text-black/40">Nenhum consórcio. Adicione o primeiro acima.</li>}
        </ul>
      </div>
    </section>
  );
}
