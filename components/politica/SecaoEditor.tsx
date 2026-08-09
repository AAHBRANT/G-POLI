"use client";

import { useEffect, useState, useTransition } from "react";
import { salvarSecao, alternarAberturaArea } from "@/app/(shell)/catalogo/[id]/conteudo-actions";
import { Button } from "@/components/ui/Button";
import ThreadComentario from "@/components/politica/ThreadComentario";

type ComentarioThread = {
  id: string;
  texto: string;
  autorNome: string;
  autorEmail: string;
  resolvido: boolean;
  resolvidoPorNome: string | null;
  criadoEm: string | Date;
  paragrafoIndex: number;
  trechoAncora: string;
  respostas: ComentarioThread[];
};

type Props = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: "texto" | "tabela";
  corpo: string;
  colunas: string[];
  linhas: string[][];
  dica?: string;
  podeEditar: boolean; // este usuário pode editar esta seção
  abertaAArea: boolean; // liberada ao perfil área
  mostrarToggle: boolean; // SGI/admin: mostra o controle de liberação
  // Sprint 3: comentários de revisão por parágrafo. podeComentar é
  // independente de podeEditar (revisor pode comentar sem poder editar).
  comentarios?: ComentarioThread[];
  podeComentar?: boolean;
};

export default function SecaoEditor(props: Props) {
  const [corpo, setCorpo] = useState(props.corpo);
  const [linhas, setLinhas] = useState<string[][]>(props.linhas);
  const [aberta, setAberta] = useState(props.abertaAArea);
  const [salvo, setSalvo] = useState<null | "ok" | "erro">(null);
  const [sujo, setSujo] = useState(false); // há mudança não salva
  const [pendente, iniciar] = useTransition();
  const [togglePend, iniciarToggle] = useTransition();

  // Resincroniza com o servidor quando os props mudam (ex.: router.refresh()
  // após aplicar rascunho da IA) — sem isso, o useState acima só lê o valor
  // inicial na primeira montagem e a seção fica presa no conteúdo antigo até
  // o usuário sair da tela e voltar. Só pula a resincronização se houver
  // edição local não salva, pra nunca sobrescrever o que o usuário digitou.
  useEffect(() => {
    if (sujo) return;
    setCorpo(props.corpo);
    setLinhas(props.linhas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.corpo, props.linhas]);

  const nCols = props.colunas.length || 2;
  const ro = !props.podeEditar; // read-only

  function salvar() {
    if (ro) return;
    setSalvo(null);
    iniciar(async () => {
      const r =
        props.tipo === "tabela"
          ? await salvarSecao(props.id, { linhas })
          : await salvarSecao(props.id, { corpo });
      setSalvo(r.ok ? "ok" : "erro");
      if (r.ok) setSujo(false);
    });
  }

  // Autosave: salva ao sair do campo se houver mudança pendente.
  function autosave() {
    if (!ro && sujo && !pendente) salvar();
  }

  function alternar() {
    const novo = !aberta;
    setAberta(novo);
    iniciarToggle(async () => {
      const r = await alternarAberturaArea(props.id, novo);
      if (!r.ok) setAberta(!novo); // reverte em falha
    });
  }

  function addLinha() {
    setLinhas((l) => [...l, Array(nCols).fill("")]);
    setSujo(true);
  }
  function removeLinha(i: number) {
    setLinhas((l) => l.filter((_, idx) => idx !== i));
    setSujo(true);
  }
  function editarCelula(i: number, c: number, v: string) {
    setLinhas((l) => l.map((row, idx) => (idx === i ? row.map((cell, cidx) => (cidx === c ? v : cell)) : row)));
    setSujo(true);
  }

  return (
    <section id={`secao-${props.codigo}`} className="rounded-lg border border-black/10 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded bg-marsala text-xs font-semibold text-white">
          {props.codigo}
        </span>
        <h3 className="text-sm font-semibold text-black/80">{props.titulo}</h3>
        {aberta && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            aberta à área
          </span>
        )}
        <span className="ml-auto text-[10px] uppercase tracking-wide text-black/30">{props.tipo}</span>
      </div>
      {props.dica && <p className="mb-3 text-xs text-black/40">{props.dica}</p>}

      {props.mostrarToggle && (
        <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-xs text-black/60">
          <input type="checkbox" checked={aberta} onChange={alternar} disabled={togglePend} />
          Liberar esta seção para edição pela área
        </label>
      )}

      {props.tipo === "texto" ? (
        <>
          <textarea
            value={corpo}
            onChange={(e) => { setCorpo(e.target.value); setSujo(true); }}
            onBlur={autosave}
            rows={6}
            disabled={ro}
            placeholder="Escreva o conteúdo desta seção…"
            // Formatação automática (Sprint 2): fonte, justificado e espaçamento
            // aqui espelham o que sai no .docx oficial (templates/politica-modelo.docx
            // — Arial, corpo justificado, spacing before/after 120 twips ≈ leading 1.15).
            // O usuário não escolhe formatação — o padrão institucional é aplicado sozinho.
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            className="w-full rounded-md border border-black/15 p-3 text-sm leading-[1.15] text-justify outline-none focus:border-marsala disabled:bg-black/[0.03] disabled:text-black/50"
          />

          {/* Sprint 3: comentários de revisão, um thread por parágrafo (linha
              de corpo.split("\n") — mesmo critério usado por gerarDocx.ts pra
              quebrar parágrafo no .docx oficial). Independente do modo edição:
              revisor comenta mesmo sem poder editar (podeComentar ≠ podeEditar). */}
          {(props.podeComentar || (props.comentarios && props.comentarios.length > 0)) && (
            // Usa props.corpo (última versão SALVA), não o `corpo` do estado local —
            // comentário ancora no que já foi persistido, nunca em edição em
            // andamento ainda não salva (evita índice de parágrafo instável).
            <div className="mt-2 space-y-1 border-t border-black/5 pt-2">
              {props.corpo.split("\n").map((trecho, i) => (
                <ThreadComentario
                  key={i}
                  secaoId={props.id}
                  paragrafoIndex={i}
                  trechoAncora={trecho}
                  podeComentar={!!props.podeComentar}
                  comentarios={(props.comentarios ?? []).filter((c) => c.paragrafoIndex === i)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-black/50">
                {props.colunas.map((c) => (
                  <th key={c} className="px-2 py-1 font-medium">{c}</th>
                ))}
                {!ro && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {linhas.map((row, i) => (
                <tr key={i} className="align-top">
                  {Array.from({ length: nCols }).map((_, c) => (
                    <td key={c} className="px-1 py-1">
                      <textarea
                        value={row[c] ?? ""}
                        onChange={(e) => editarCelula(i, c, e.target.value)}
                        onBlur={autosave}
                        rows={2}
                        disabled={ro}
                        // Mesma formatação automática do corpo de texto (ver comentário acima).
                        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                        className="w-full rounded border border-black/15 p-2 text-sm leading-[1.15] text-justify outline-none focus:border-marsala disabled:bg-black/[0.03] disabled:text-black/50"
                      />
                    </td>
                  ))}
                  {!ro && (
                    <td className="px-1 py-1">
                      <button
                        onClick={() => removeLinha(i)}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        title="Remover linha"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!ro && (
            <button
              onClick={addLinha}
              className="mt-2 rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/70 hover:bg-black/5"
            >
              + Adicionar linha
            </button>
          )}
        </div>
      )}

      {ro ? (
        <p className="mt-3 text-xs text-black/40">
          Somente leitura — seção não liberada ao seu perfil.
        </p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={salvar} disabled={pendente || !sujo}>
            {pendente ? "Salvando…" : "Salvar seção"}
          </Button>
          {pendente ? (
            <span className="text-sm text-black/40">Salvando…</span>
          ) : sujo ? (
            <span className="text-sm text-amber-700">Alterações não salvas — salvam ao sair do campo</span>
          ) : salvo === "ok" ? (
            <span className="text-sm text-emerald-700">Salvo ✓</span>
          ) : salvo === "erro" ? (
            <span className="text-sm text-red-600">Erro ao salvar.</span>
          ) : null}
        </div>
      )}
    </section>
  );
}
