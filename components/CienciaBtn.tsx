"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { darCiencia } from "@/app/(shell)/catalogo/[id]/ciencia-actions";

export default function CienciaBtn({ politicaId }: { politicaId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await darCiencia(politicaId);
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Falha.");
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={confirmar}
        disabled={pendente}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
      >
        {pendente ? "…" : "Li e estou ciente"}
      </button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </div>
  );
}
