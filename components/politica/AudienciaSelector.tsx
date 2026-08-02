"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirAudiencia } from "@/app/(shell)/catalogo/[id]/audiencia-actions";
import { Button } from "@/components/ui/Button";

type Opcao = { id: string; rotulo: string };

export default function AudienciaSelector({
  politicaId,
  setores,
  usuarios,
  setoresSelecionados,
  usuariosSelecionados,
}: {
  politicaId: string;
  setores: Opcao[];
  usuarios: Opcao[];
  setoresSelecionados: string[];
  usuariosSelecionados: string[];
}) {
  const router = useRouter();
  const [setorIds, setSetorIds] = useState<string[]>(setoresSelecionados);
  const [usuarioIds, setUsuarioIds] = useState<string[]>(usuariosSelecionados);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternar(lista: string[], id: string): string[] {
    return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
  }

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const r = await definirAudiencia(politicaId, setorIds, usuarioIds);
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Falha ao salvar público-alvo.");
    });
  }

  const vazio = setorIds.length === 0 && usuarioIds.length === 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-black/50">
        {vazio
          ? "Sem seleção: a notificação de publicação vai para todos os colaboradores ativos."
          : "A notificação de publicação vai só para quem estiver marcado abaixo (setor + individual, somados)."}
      </p>

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-black/40">Setores</p>
        {setores.length === 0 ? (
          <p className="text-xs text-black/40">Nenhum setor cadastrado.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {setores.map((s) => (
              <label
                key={s.id}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition ${
                  setorIds.includes(s.id)
                    ? "border-marsala bg-marsala-50 text-marsala"
                    : "border-black/15 text-black/60 hover:bg-black/5"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={setorIds.includes(s.id)}
                  onChange={() => setSetorIds((l) => alternar(l, s.id))}
                />
                {s.rotulo}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-black/40">Colaboradores individuais</p>
        {usuarios.length === 0 ? (
          <p className="text-xs text-black/40">Nenhum colaborador cadastrado.</p>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {usuarios.map((u) => (
              <label
                key={u.id}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs transition ${
                  usuarioIds.includes(u.id)
                    ? "border-marsala bg-marsala-50 text-marsala"
                    : "border-black/15 text-black/60 hover:bg-black/5"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={usuarioIds.includes(u.id)}
                  onChange={() => setUsuarioIds((l) => alternar(l, u.id))}
                />
                {u.rotulo}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar público-alvo"}
        </Button>
        {erro && <span className="text-xs text-red-600">{erro}</span>}
      </div>
    </div>
  );
}
