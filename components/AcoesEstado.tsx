"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publicarPolitica, revogarPolitica, reabrirPolitica } from "@/app/(shell)/catalogo/[id]/estado-actions";

type Acao = "publicar" | "revogar" | "reabrir";

const CONFIRMA: Record<Acao, string> = {
  publicar: "Publicar esta política? O conteúdo será congelado (edição bloqueada) e ficará oficial.",
  revogar: "Revogar esta política? Ela deixa de valer (o histórico é preservado).",
  reabrir: "Reabrir para revisão? Volta a rascunho e a edição é destravada.",
};

export default function AcoesEstado({ id, estado }: { id: string; estado: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Acao | null>(null);
  const [pendente, iniciar] = useTransition();

  // Não usar window.confirm(): dentro do iframe do Teams o diálogo nativo é
  // bloqueado sem aviso — o clique parecia "não fazer nada". Modal próprio
  // funciona em qualquer contexto (web, Teams desktop/mobile).
  function pedirConfirmacao(acao: Acao) {
    setErro(null);
    setConfirmando(acao);
  }

  function confirmar() {
    const acao = confirmando;
    if (!acao) return;
    setConfirmando(null);
    iniciar(async () => {
      const fn = acao === "publicar" ? publicarPolitica : acao === "revogar" ? revogarPolitica : reabrirPolitica;
      const r = await fn(id);
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Falha na ação.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {estado === "rascunho" && (
          <button
            onClick={() => pedirConfirmacao("publicar")}
            disabled={pendente}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {pendente ? "…" : "Publicar"}
          </button>
        )}
        {estado === "publicada" && (
          <>
            <button
              onClick={() => pedirConfirmacao("reabrir")}
              disabled={pendente}
              className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:opacity-60"
            >
              Reabrir p/ revisão
            </button>
            <button
              onClick={() => pedirConfirmacao("revogar")}
              disabled={pendente}
              className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 disabled:opacity-60"
            >
              Revogar
            </button>
          </>
        )}
        {estado === "revogada" && (
          <button
            onClick={() => pedirConfirmacao("reabrir")}
            disabled={pendente}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:opacity-60"
          >
            Reabrir p/ revisão
          </button>
        )}
      </div>
      {erro && <span className="text-xs text-red-600">{erro}</span>}

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <p className="text-sm text-black/80">{CONFIRMA[confirmando]}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmando(null)}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                className="rounded-md bg-marsala px-3 py-1.5 text-xs font-medium text-white hover:bg-marsala-600"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
