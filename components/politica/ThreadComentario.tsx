"use client";

import { useState, useTransition } from "react";
import {
  criarComentario,
  responderComentario,
  alternarResolvidoComentario,
} from "@/app/(shell)/catalogo/[id]/comentario-actions";

// Botão compacto próprio (não <Button> compartilhado — aquele é fixo em
// px-4/py-2/text-sm por decisão de design; aqui precisa ser bem menor,
// no mesmo estilo dos botões pequenos já usados em SecaoEditor, ex.:
// "+ Adicionar linha").
const BOTAO_MINI =
  "shrink-0 rounded-md bg-bege ring-1 ring-black/10 px-2.5 py-1 text-[11px] font-medium text-black/85 transition hover:bg-bege-300 disabled:opacity-60";

// Só 2 níveis (thread raiz + respostas diretas — responderComentario sempre
// aninha na raiz, nunca resposta-de-resposta). "respostas" usa um tipo à
// parte sem o próprio campo "respostas" em vez de Comentario[] recursivo,
// pra bater com o dado real (a consulta só inclui 1 nível de respostas).
type ComentarioResposta = {
  id: string;
  texto: string;
  autorNome: string;
  autorEmail: string;
  resolvido: boolean;
  resolvidoPorNome: string | null;
  criadoEm: string | Date;
  trechoAncora: string;
};

type Comentario = ComentarioResposta & {
  respostas: ComentarioResposta[];
};

type Props = {
  secaoId: string;
  paragrafoIndex: number;
  trechoAncora: string; // texto ATUAL do parágrafo (última versão salva) — usado pra criar novo comentário e detectar deriva dos antigos
  comentarios: Comentario[]; // threads raiz deste parágrafo (já vêm com respostas)
  podeComentar: boolean;
};

// Sprint 3: painel de comentários de revisão por parágrafo (estilo Word).
// Fica ao lado/abaixo do texto — não edita o conteúdo da seção, só anota.
export default function ThreadComentario(props: Props) {
  const [aberto, setAberto] = useState(false);
  const [novoTexto, setNovoTexto] = useState("");
  const [respostaAberta, setRespostaAberta] = useState<string | null>(null);
  const [respostaTexto, setRespostaTexto] = useState("");
  const [pendente, iniciar] = useTransition();

  const abertos = props.comentarios.filter((c) => !c.resolvido).length;

  function enviarNovo() {
    const texto = novoTexto.trim();
    if (!texto) return;
    iniciar(async () => {
      const r = await criarComentario(props.secaoId, {
        paragrafoIndex: props.paragrafoIndex,
        trechoAncora: props.trechoAncora,
        texto,
      });
      if (r.ok) setNovoTexto("");
    });
  }

  function enviarResposta(comentarioId: string) {
    const texto = respostaTexto.trim();
    if (!texto) return;
    iniciar(async () => {
      const r = await responderComentario(comentarioId, texto);
      if (r.ok) {
        setRespostaTexto("");
        setRespostaAberta(null);
      }
    });
  }

  function alternar(comentarioId: string, resolvido: boolean) {
    iniciar(async () => {
      await alternarResolvidoComentario(comentarioId, resolvido);
    });
  }

  if (!props.podeComentar && props.comentarios.length === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-black/40 hover:text-marsala"
      >
        💬 {props.comentarios.length === 0
          ? "Comentar"
          : `${props.comentarios.length} comentário${props.comentarios.length > 1 ? "s" : ""}${
              abertos > 0 ? ` · ${abertos} aberto${abertos > 1 ? "s" : ""}` : " · resolvidos"
            }`}
      </button>

      {aberto && (
        <div className="mt-2 space-y-3 rounded-md border border-black/10 bg-black/[0.015] p-3">
          {props.comentarios.map((c) => (
            <div key={c.id} className={`rounded-md border p-2 text-xs ${c.resolvido ? "border-emerald-200 bg-emerald-50/50" : "border-black/10 bg-white"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-black/80">{c.autorNome}</span>
                  <p className="mt-0.5 whitespace-pre-wrap text-black/70">{c.texto}</p>
                </div>
                {props.podeComentar && (
                  <button
                    onClick={() => alternar(c.id, !c.resolvido)}
                    disabled={pendente}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-black/40 hover:bg-black/5"
                    title={c.resolvido ? "Reabrir" : "Marcar como resolvido"}
                  >
                    {c.resolvido ? "Reabrir" : "Resolver"}
                  </button>
                )}
              </div>
              {c.resolvido && (
                <p className="mt-1 text-[10px] text-emerald-700">
                  Resolvido{c.resolvidoPorNome ? ` por ${c.resolvidoPorNome}` : ""}
                </p>
              )}
              {!c.resolvido && c.trechoAncora !== props.trechoAncora && (
                <p className="mt-1 text-[10px] text-amber-700">
                  ⚠ O texto deste parágrafo mudou desde este comentário — confira se ainda se aplica.
                </p>
              )}

              {c.respostas.map((r) => (
                <div key={r.id} className="ml-3 mt-2 border-l border-black/10 pl-2">
                  <span className="font-medium text-black/80">{r.autorNome}</span>
                  <p className="mt-0.5 whitespace-pre-wrap text-black/70">{r.texto}</p>
                </div>
              ))}

              {props.podeComentar && (
                respostaAberta === c.id ? (
                  <div className="ml-3 mt-2 flex gap-2">
                    <input
                      autoFocus
                      value={respostaTexto}
                      onChange={(e) => setRespostaTexto(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && enviarResposta(c.id)}
                      placeholder="Responder…"
                      className="w-full rounded border border-black/15 px-2 py-1 text-xs outline-none focus:border-marsala"
                    />
                    <button onClick={() => enviarResposta(c.id)} disabled={pendente} className={BOTAO_MINI}>
                      Enviar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRespostaAberta(c.id)}
                    className="ml-3 mt-2 text-[10px] text-black/40 hover:text-marsala"
                  >
                    Responder
                  </button>
                )
              )}
            </div>
          ))}

          {props.podeComentar && (
            <div className="flex gap-2">
              <input
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarNovo()}
                placeholder="Comentar este parágrafo…"
                className="w-full rounded border border-black/15 px-2 py-1 text-xs outline-none focus:border-marsala"
              />
              <button onClick={enviarNovo} disabled={pendente} className={BOTAO_MINI}>
                Comentar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
