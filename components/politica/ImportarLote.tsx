"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { importarDocumento } from "@/app/(shell)/catalogo/actions";
import { CLASSIFICACOES, TIPOS_DOCUMENTO, type TipoDocumentoValor } from "@/lib/constants";
import { analisarNomeArquivo, LIMITE_ARQUIVOS_LOTE } from "@/lib/politica/importarLote";
import { BUTTON_CLASSES } from "@/components/ui/Button";

const EXTENSOES = [".docx", ".pdf", ".txt", ".md"];
const TAMANHO_MAXIMO = 10 * 1024 * 1024; // mesmo limite da importação de um arquivo

type Linha = {
  chave: string;
  arquivo: File;
  titulo: string;
  tipo: TipoDocumentoValor | "";
  area: string;
  classificacao: string;
  /** Problema que impede a importação desta linha (formato/tamanho). */
  bloqueio: string | null;
  situacao: "pendente" | "importando" | "ok" | "erro";
  mensagem?: string;
  resumo?: { secoes: number; tabelas: number; avisos: string[] };
  id?: string;
};

function tamanhoLegivel(b: number): string {
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const campo =
  "h-9 w-full rounded-lg bg-white/70 px-2.5 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-black/50 disabled:opacity-60";

// Importação em lote do acervo: escolha vários arquivos, confira o que o sistema
// sugeriu pelo nome (tipo, área e título) e importe. Cada arquivo vira um
// RASCUNHO, um por vez (assim os códigos normativos nunca se atropelam); depois o
// SGI revisa, vincula ao documento superior e publica.
export default function ImportarLote({
  areas,
  tipoPadrao,
}: {
  areas: string[];
  tipoPadrao: TipoDocumentoValor | "";
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [areaPadrao, setAreaPadrao] = useState("");
  const [classPadrao, setClassPadrao] = useState("publico_interno");
  const [rodando, setRodando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function adicionar(arquivos: FileList | null) {
    if (!arquivos) return;
    setAviso(null);
    setLinhas((atual) => {
      const novas: Linha[] = [];
      const jaTem = new Set(atual.map((l) => `${l.arquivo.name}|${l.arquivo.size}`));
      let ignorados = 0;
      for (const f of Array.from(arquivos)) {
        if (atual.length + novas.length >= LIMITE_ARQUIVOS_LOTE) {
          ignorados++;
          continue;
        }
        if (jaTem.has(`${f.name}|${f.size}`)) continue;
        const sug = analisarNomeArquivo(f.name);
        const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
        novas.push({
          chave: `${f.name}|${f.size}|${Math.random().toString(36).slice(2, 7)}`,
          arquivo: f,
          titulo: sug.titulo,
          tipo: sug.tipo ?? tipoPadrao,
          area: sug.area ?? areaPadrao,
          classificacao: classPadrao,
          bloqueio: !EXTENSOES.includes(ext)
            ? "Formato não suportado (use .docx, .pdf, .txt ou .md)."
            : f.size > TAMANHO_MAXIMO
              ? "Arquivo maior que 10 MB."
              : null,
          situacao: "pendente",
        });
      }
      if (ignorados > 0) setAviso(`Limite de ${LIMITE_ARQUIVOS_LOTE} arquivos por lote: ${ignorados} ficaram de fora.`);
      return [...atual, ...novas];
    });
    if (entrada.current) entrada.current.value = "";
  }

  function mudar(chave: string, parte: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...parte } : l)));
  }

  function aplicarATodas(parte: Partial<Pick<Linha, "area" | "classificacao" | "tipo">>) {
    setLinhas((atual) => atual.map((l) => (l.situacao === "ok" || l.situacao === "importando" ? l : { ...l, ...parte })));
  }

  const importaveis = linhas.filter((l) => l.situacao !== "ok" && !l.bloqueio);
  const incompletas = importaveis.filter((l) => !l.titulo.trim() || !l.tipo || !l.area.trim());
  const concluidas = linhas.filter((l) => l.situacao === "ok").length;
  const comErro = linhas.filter((l) => l.situacao === "erro").length;
  const elegiveis = linhas.filter((l) => !l.bloqueio).length; // arquivos bloqueados não entram na conta
  const progresso = elegiveis ? Math.round((concluidas / elegiveis) * 100) : 0;

  async function importarTodas() {
    setRodando(true);
    setAviso(null);
    // Sequencial de propósito: o código normativo (sequência por área e tipo) é gerado a cada criação.
    for (const alvo of linhas.filter((l) => l.situacao !== "ok" && !l.bloqueio)) {
      mudar(alvo.chave, { situacao: "importando", mensagem: undefined });
      const fd = new FormData();
      fd.set("titulo", alvo.titulo.trim());
      fd.set("area", alvo.area.trim());
      fd.set("tipo", alvo.tipo);
      fd.set("classificacao", alvo.classificacao);
      fd.set("arquivo", alvo.arquivo);
      try {
        const r = await importarDocumento(fd);
        if (r.ok && r.id) mudar(alvo.chave, { situacao: "ok", id: r.id, mensagem: undefined, resumo: r.resumo });
        else mudar(alvo.chave, { situacao: "erro", mensagem: r.erro ?? "Erro desconhecido." });
      } catch {
        mudar(alvo.chave, { situacao: "erro", mensagem: "Falha de conexão. Tente de novo." });
      }
    }
    setRodando(false);
  }

  return (
    <div className="space-y-5">
      <section className="liquid relative space-y-4 rounded-2xl p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <input
              ref={entrada}
              type="file"
              multiple
              accept={EXTENSOES.join(",")}
              onChange={(e) => adicionar(e.target.files)}
              className="sr-only"
              id="arquivos-lote"
              disabled={rodando}
            />
            <label htmlFor="arquivos-lote" className={`${BUTTON_CLASSES} inline-block cursor-pointer ${rodando ? "opacity-60" : ""}`}>
              Escolher arquivos
            </label>
            <p className="mt-1.5 text-[11px] text-black/50">
              .docx, .pdf, .txt ou .md · até 10 MB cada · até {LIMITE_ARQUIVOS_LOTE} por lote
            </p>
          </div>

          {linhas.length > 0 && (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Área para todos</span>
                <input
                  list="areas-lote"
                  value={areaPadrao}
                  onChange={(e) => {
                    setAreaPadrao(e.target.value);
                    aplicarATodas({ area: e.target.value });
                  }}
                  placeholder="Ex.: Qualidade"
                  className={`${campo} w-56`}
                  disabled={rodando}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-black/45">Classificação para todos</span>
                <select
                  value={classPadrao}
                  onChange={(e) => {
                    setClassPadrao(e.target.value);
                    aplicarATodas({ classificacao: e.target.value });
                  }}
                  className={`${campo} w-48`}
                  disabled={rodando}
                >
                  {CLASSIFICACOES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        <datalist id="areas-lote">
          {areas.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        {aviso && <p role="alert" className="text-xs font-medium text-amber-800">{aviso}</p>}
      </section>

      {linhas.length > 0 && (
        <section className="liquid relative overflow-hidden rounded-2xl">
          <ul className="divide-y divide-black/5">
            {linhas.map((l) => (
              <li key={l.chave} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_11rem_12rem_9rem_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-black/70" title={l.arquivo.name}>
                    {l.arquivo.name}
                  </p>
                  <p className="text-[11px] text-black/40">{tamanhoLegivel(l.arquivo.size)}</p>
                </div>
                <input
                  value={l.titulo}
                  onChange={(e) => mudar(l.chave, { titulo: e.target.value })}
                  aria-label={`Título de ${l.arquivo.name}`}
                  disabled={rodando || l.situacao === "ok" || !!l.bloqueio}
                  className={campo}
                />
                <select
                  value={l.tipo}
                  onChange={(e) => mudar(l.chave, { tipo: e.target.value as TipoDocumentoValor })}
                  aria-label={`Tipo de ${l.arquivo.name}`}
                  disabled={rodando || l.situacao === "ok" || !!l.bloqueio}
                  className={campo}
                >
                  <option value="">Tipo…</option>
                  {TIPOS_DOCUMENTO.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
                <input
                  list="areas-lote"
                  value={l.area}
                  onChange={(e) => mudar(l.chave, { area: e.target.value })}
                  placeholder="Área…"
                  aria-label={`Área de ${l.arquivo.name}`}
                  disabled={rodando || l.situacao === "ok" || !!l.bloqueio}
                  className={campo}
                />
                <select
                  value={l.classificacao}
                  onChange={(e) => mudar(l.chave, { classificacao: e.target.value })}
                  aria-label={`Classificação de ${l.arquivo.name}`}
                  disabled={rodando || l.situacao === "ok" || !!l.bloqueio}
                  className={campo}
                >
                  {CLASSIFICACOES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </option>
                  ))}
                </select>
                <div className="flex min-w-[7rem] items-center justify-end gap-2 text-xs">
                  {l.situacao === "ok" && l.id ? (
                    <Link href={`/catalogo/${l.id}`} className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 hover:underline">
                      Importado · abrir
                    </Link>
                  ) : l.situacao === "importando" ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">Importando…</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinhas((a) => a.filter((x) => x.chave !== l.chave))}
                      disabled={rodando}
                      className="rounded-full px-2 py-1 font-semibold text-black/50 hover:bg-black/5 hover:text-black disabled:opacity-40"
                      aria-label={`Remover ${l.arquivo.name}`}
                    >
                      Remover
                    </button>
                  )}
                </div>
                {l.situacao === "ok" && l.resumo && (
                  <div className="text-xs text-black/70 sm:col-span-6">
                    <p className="font-semibold">
                      {l.resumo.secoes} seç{l.resumo.secoes === 1 ? "ão" : "ões"} criada{l.resumo.secoes === 1 ? "" : "s"}
                      {l.resumo.tabelas > 0 ? `, sendo ${l.resumo.tabelas} tabela${l.resumo.tabelas === 1 ? "" : "s"}` : ""}. Revise o rascunho antes de enviar para aprovação.
                    </p>
                    {l.resumo.avisos.map((a) => (
                      <p key={a} className="text-amber-800">
                        Atenção: {a}
                      </p>
                    ))}
                  </div>
                )}
                {(l.bloqueio || l.mensagem) && (
                  <p role="alert" className="text-xs font-medium text-red-700 sm:col-span-6">
                    {l.bloqueio ?? l.mensagem}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {linhas.length > 0 && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={importarTodas}
            disabled={rodando || importaveis.length === 0 || incompletas.length > 0}
            className={`${BUTTON_CLASSES} disabled:cursor-not-allowed`}
          >
            {rodando ? "Importando…" : `Importar ${importaveis.length} documento${importaveis.length === 1 ? "" : "s"}`}
          </button>
          {incompletas.length > 0 && !rodando && (
            <p className="text-xs font-medium text-amber-800">
              {incompletas.length} linha{incompletas.length === 1 ? "" : "s"} sem título, tipo ou área.
            </p>
          )}
          {(rodando || concluidas > 0) && (
            <div className="flex min-w-[14rem] flex-1 items-center gap-3" role="status" aria-live="polite">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-black/10"
                role="progressbar"
                aria-valuenow={progresso}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full rounded-full bg-bege-500 transition-[width] duration-500" style={{ width: `${progresso}%` }} />
              </div>
              <span className="text-xs font-medium text-black/60">
                {concluidas} de {elegiveis}
                {comErro > 0 && <span className="text-red-700"> · {comErro} com erro</span>}
              </span>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-black/50">
        Cada arquivo vira um <strong>rascunho</strong>. Depois, revise o texto, vincule ao documento superior e publique: é a
        publicação que coloca o documento na biblioteca e na busca da IA.
      </p>
    </div>
  );
}
