"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  publicarPolitica,
  revogarPolitica,
  reabrirPolitica,
  enviarParaAprovacao,
  aprovarGestor,
  rejeitarGestor,
  rejeitarDiretoria,
  retirarDaAprovacao,
} from "@/app/(shell)/catalogo/[id]/estado-actions";
import { Button } from "@/components/ui/Button";

type Acao =
  | "publicar"
  | "revogar"
  | "reabrir"
  | "enviar_aprovacao"
  | "aprovar_gestor"
  | "rejeitar_gestor"
  | "rejeitar_diretoria"
  | "retirar_aprovacao";

// Ações que pedem motivo (texto livre, obrigatório) em vez de só confirmar.
const PEDE_MOTIVO: Acao[] = ["rejeitar_gestor", "rejeitar_diretoria"];

const CONFIRMA: Record<Acao, string> = {
  publicar: "Publicar esta política? O conteúdo será congelado (edição bloqueada) e ficará oficial.",
  revogar: "Revogar esta política? Ela deixa de valer (o histórico é preservado).",
  reabrir: "Reabrir para revisão? Volta a rascunho e a edição é destravada.",
  enviar_aprovacao: "Enviar para aprovação? O conteúdo fica congelado a partir de agora — o Gestor do setor vai revisar.",
  aprovar_gestor: "Aprovar esta política? Ela segue automaticamente para a aprovação da Diretoria.",
  rejeitar_gestor: "Rejeitar esta política? Ela volta para rascunho — descreva o motivo para quem editou.",
  rejeitar_diretoria: "Rejeitar esta política? Ela volta para rascunho — descreva o motivo para quem editou.",
  retirar_aprovacao: "Retirar da aprovação e voltar para rascunho, para ajustar algo antes de reenviar?",
};

type Props = {
  id: string;
  estado: string;
  // Sprint 4/5/6: cada alçada é calculada no server (rbac) e passada como
  // prop — o componente só decide QUAIS botões mostrar pro estado atual,
  // nunca decide permissão por conta própria.
  podeEnviar: boolean; // enviar_aprovacao (quem edita o conteúdo)
  podeGestor: boolean; // aprovar/rejeitar na etapa do Gestor
  podeDiretoria: boolean; // publicar(=aprovar)/rejeitar/revogar/reabrir na etapa da Diretoria
  podeRetirar: boolean; // retirar_aprovacao (autor do envio)
};

export default function AcoesEstado({ id, estado, podeEnviar, podeGestor, podeDiretoria, podeRetirar }: Props) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();

  // Não usar window.confirm(): dentro do iframe do Teams o diálogo nativo é
  // bloqueado sem aviso — o clique parecia "não fazer nada". Modal próprio
  // funciona em qualquer contexto (web, Teams desktop/mobile).
  function pedirConfirmacao(acao: Acao) {
    setErro(null);
    setMotivo("");
    setConfirmando(acao);
  }

  function confirmar() {
    const acao = confirmando;
    if (!acao) return;
    if (PEDE_MOTIVO.includes(acao) && !motivo.trim()) {
      setErro("Informe o motivo da rejeição.");
      return;
    }
    setConfirmando(null);
    iniciar(async () => {
      const r = await executar(acao, id, motivo);
      if (r.ok) router.refresh();
      else setErro(r.erro ?? "Falha na ação.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {estado === "rascunho" && (
          <>
            {podeEnviar && (
              <button
                onClick={() => pedirConfirmacao("enviar_aprovacao")}
                disabled={pendente}
                className="rounded-md bg-bege ring-1 ring-black/10 px-3 py-1.5 text-xs font-medium text-black/85 transition hover:bg-bege-300 disabled:opacity-60"
              >
                {pendente ? "…" : "Enviar para aprovação"}
              </button>
            )}
            {/* Atalho legado (modelo A): Diretoria/admin ainda publicam direto,
                pulando o Gestor — ver transicao("rascunho","publicar") em dominio.ts. */}
            {podeDiretoria && (
              <button
                onClick={() => pedirConfirmacao("publicar")}
                disabled={pendente}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
              >
                {pendente ? "…" : "Publicar direto"}
              </button>
            )}
          </>
        )}

        {estado === "em_aprovacao_gestor" && (
          <>
            {podeGestor && (
              <>
                <button
                  onClick={() => pedirConfirmacao("aprovar_gestor")}
                  disabled={pendente}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
                >
                  {pendente ? "…" : "Aprovar"}
                </button>
                <button
                  onClick={() => pedirConfirmacao("rejeitar_gestor")}
                  disabled={pendente}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 disabled:opacity-60"
                >
                  Rejeitar
                </button>
              </>
            )}
            {podeRetirar && (
              <button
                onClick={() => pedirConfirmacao("retirar_aprovacao")}
                disabled={pendente}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:opacity-60"
              >
                Retirar da aprovação
              </button>
            )}
          </>
        )}

        {estado === "em_aprovacao_diretoria" && (
          <>
            {podeDiretoria && (
              <>
                <button
                  onClick={() => pedirConfirmacao("publicar")}
                  disabled={pendente}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
                >
                  {pendente ? "…" : "Aprovar e publicar"}
                </button>
                <button
                  onClick={() => pedirConfirmacao("rejeitar_diretoria")}
                  disabled={pendente}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 disabled:opacity-60"
                >
                  Rejeitar
                </button>
              </>
            )}
            {podeRetirar && (
              <button
                onClick={() => pedirConfirmacao("retirar_aprovacao")}
                disabled={pendente}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:opacity-60"
              >
                Retirar da aprovação
              </button>
            )}
          </>
        )}

        {estado === "publicada" && podeDiretoria && (
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
        {estado === "revogada" && podeDiretoria && (
          <button
            onClick={() => pedirConfirmacao("reabrir")}
            disabled={pendente}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:opacity-60"
          >
            Reabrir p/ revisão
          </button>
        )}
      </div>
      {erro && !confirmando && <span className="text-xs text-red-600">{erro}</span>}

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl liquid relative p-5 shadow-xl">
            <p className="text-sm text-black/80">{CONFIRMA[confirmando]}</p>
            {PEDE_MOTIVO.includes(confirmando) && (
              <textarea
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Motivo da rejeição…"
                className="mt-3 w-full rounded-md border border-black/15 p-2 text-sm outline-none focus:border-marsala"
              />
            )}
            {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmando(null)}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
              >
                Cancelar
              </button>
              <Button onClick={confirmar}>Confirmar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function executar(acao: Acao, id: string, motivo: string) {
  switch (acao) {
    case "publicar":
      return publicarPolitica(id);
    case "revogar":
      return revogarPolitica(id);
    case "reabrir":
      return reabrirPolitica(id);
    case "enviar_aprovacao":
      return enviarParaAprovacao(id);
    case "aprovar_gestor":
      return aprovarGestor(id);
    case "rejeitar_gestor":
      return rejeitarGestor(id, motivo);
    case "rejeitar_diretoria":
      return rejeitarDiretoria(id, motivo);
    case "retirar_aprovacao":
      return retirarDaAprovacao(id);
  }
}
