"use client";

import { useTransition } from "react";
import { gerarEsqueleto } from "@/app/(shell)/catalogo/[id]/conteudo-actions";
// Contagem derivada do próprio esqueleto: número fixo no rótulo já ficou
// desatualizado uma vez (dizia 8 depois da estrutura passar a 7).
import { ESQUELETO_PADRAO } from "@/lib/politica/esqueleto";

export default function GerarEsqueletoBtn({ politicaId }: { politicaId: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      onClick={() => iniciar(() => gerarEsqueleto(politicaId).then(() => {}))}
      disabled={pendente}
      className="rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600 disabled:opacity-60"
    >
      {pendente
        ? "Gerando…"
        : `Gerar esqueleto padrão (${ESQUELETO_PADRAO.length} seções)`}
    </button>
  );
}
