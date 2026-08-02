"use client";

import { useTransition } from "react";
import { gerarEsqueleto } from "@/app/(shell)/catalogo/[id]/conteudo-actions";
// Contagem derivada do próprio esqueleto: número fixo no rótulo já ficou
// desatualizado uma vez (dizia 8 depois da estrutura passar a 7).
import { ESQUELETO_PADRAO } from "@/lib/politica/esqueleto";
import { Button } from "@/components/ui/Button";

export default function GerarEsqueletoBtn({ politicaId }: { politicaId: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      onClick={() => iniciar(() => gerarEsqueleto(politicaId).then(() => {}))}
      disabled={pendente}
    >
      {pendente
        ? "Gerando…"
        : `Gerar esqueleto padrão (${ESQUELETO_PADRAO.length} seções)`}
    </Button>
  );
}
