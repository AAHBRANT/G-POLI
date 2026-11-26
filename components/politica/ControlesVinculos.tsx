"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirSuperior, definirPrazoRevisao } from "@/app/(shell)/catalogo/[id]/hierarquia-actions";
import { PERIODICIDADES_MESES } from "@/lib/politica/revisao";

type Opcao = { id: string; rotulo: string };

// Controles de quem pode ajustar o vínculo hierárquico e o prazo de revisão.
// Cada alteração salva na hora (são metadados; não mudam o texto oficial).
export default function ControlesVinculos({
  politicaId,
  aceitaSuperior,
  superiorId,
  opcoesSuperior,
  periodicidade,
}: {
  politicaId: string;
  aceitaSuperior: boolean;
  superiorId: string | null;
  opcoesSuperior: Opcao[];
  periodicidade: number;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function salvarSuperior(id: string) {
    setErro(null);
    iniciar(async () => {
      const r = await definirSuperior(politicaId, id || null);
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Não foi possível salvar o documento superior.");
    });
  }

  function salvarPrazo(meses: number) {
    setErro(null);
    iniciar(async () => {
      const r = await definirPrazoRevisao(politicaId, meses);
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Não foi possível salvar o prazo.");
    });
  }

  const campo = "h-10 w-full rounded-lg bg-white/70 px-3 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-black/50 disabled:opacity-60";

  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy={pendente}>
      {aceitaSuperior && (
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Documento superior</span>
          <select
            value={superiorId ?? ""}
            onChange={(e) => salvarSuperior(e.target.value)}
            disabled={pendente}
            className={campo}
          >
            <option value="">Nenhum (sem superior)</option>
            {opcoesSuperior.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Revisar a cada</span>
        <select
          value={periodicidade}
          onChange={(e) => salvarPrazo(Number(e.target.value))}
          disabled={pendente}
          className={campo}
        >
          {[...new Set<number>([...PERIODICIDADES_MESES, periodicidade])]
            .sort((a, b) => a - b)
            .map((m) => (
              <option key={m} value={m}>
                {m} meses
              </option>
            ))}
        </select>
      </label>
      {erro && (
        <p role="alert" className="text-xs font-medium text-red-700 sm:col-span-2">
          {erro}
        </p>
      )}
    </div>
  );
}
