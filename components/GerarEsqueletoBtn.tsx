"use client";

import { useTransition } from "react";
import { gerarEsqueleto } from "@/app/(shell)/catalogo/[id]/conteudo-actions";

export default function GerarEsqueletoBtn({ politicaId }: { politicaId: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      onClick={() => iniciar(() => gerarEsqueleto(politicaId).then(() => {}))}
      disabled={pendente}
      className="rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600 disabled:opacity-60"
    >
      {pendente ? "Gerando…" : "Gerar esqueleto padrão (8 seções)"}
    </button>
  );
}
