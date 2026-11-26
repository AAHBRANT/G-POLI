"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarSetor, renomearSetor, alternarSetorAtivo } from "@/app/(shell)/admin/setor-actions";
import { Button } from "@/components/ui/Button";

type Setor = { id: string; nome: string; ativa: boolean };

export default function GerenciarSetores({ setores }: { setores: Setor[] }) {
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
    <section className="rounded-2xl liquid relative">
      <div className="border-b border-black/5 px-4 py-3">
        <span className="text-sm font-semibold text-black/80">Setores ({setores.length})</span>
      </div>
      <div className="px-4 py-3">
        <div className="mb-3 flex gap-2">
          <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo setor (ex.: Financeiro)" className="h-10 flex-1 rounded border border-black/15 px-3 text-sm" />
          <Button onClick={() => { if (novo.trim()) { agir(() => criarSetor(novo)); setNovo(""); } }} disabled={pend}>
            + Adicionar
          </Button>
        </div>
        {erro && <p className="mb-2 text-xs text-red-600">{erro}</p>}
        <ul className="divide-y divide-black/5">
          {setores.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
              <input
                defaultValue={s.nome}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.nome) agir(() => renomearSetor(s.id, v)); }}
                className="flex-1 rounded border border-transparent px-2 py-1 hover:border-black/10 focus:border-marsala"
              />
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.ativa ? "bg-emerald-50 text-emerald-700" : "bg-black/10 text-black/50"}`}>
                {s.ativa ? "Ativo" : "Inativo"}
              </span>
              <button onClick={() => agir(() => alternarSetorAtivo(s.id, !s.ativa))} disabled={pend}
                className="rounded border border-black/15 px-2 py-1 text-[11px] text-black/70 hover:bg-black/5 disabled:opacity-60">
                {s.ativa ? "Desativar" : "Ativar"}
              </button>
            </li>
          ))}
          {setores.length === 0 && <li className="py-3 text-center text-xs text-black/40">Nenhum setor. Adicione o primeiro acima.</li>}
        </ul>
      </div>
    </section>
  );
}
