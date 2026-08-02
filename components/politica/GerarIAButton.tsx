"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gerarRascunhoIA, aplicarSecoesIA } from "@/app/(shell)/catalogo/[id]/ia-actions";
import { Button } from "@/components/ui/Button";

type SecaoIA = { codigo: string; corpo?: string; linhas?: string[][] };
const TITULOS: Record<string, string> = {
  "1": "Objetivo", "2": "Abrangência", "3": "Princípios", "4": "Definições",
  "5": "Responsabilidades", "6": "Diretrizes Gerais", "7": "Disposições Finais", "8": "Anexos",
};

export default function GerarIAButton({ politicaId, disponivel }: { politicaId: string; disponivel: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tema, setTema] = useState("");
  const [draft, setDraft] = useState<SecaoIA[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, iniciarGerar] = useTransition();
  const [aplicando, iniciarAplicar] = useTransition();

  function gerar() {
    setErro(null); setDraft(null);
    iniciarGerar(async () => {
      const r = await gerarRascunhoIA(politicaId, tema);
      if (r.ok && r.secoes) setDraft(r.secoes);
      else setErro(r.erro ?? "Falha ao gerar.");
    });
  }
  function aplicar() {
    if (!draft) return;
    iniciarAplicar(async () => {
      const r = await aplicarSecoesIA(politicaId, draft);
      if (r.ok) { setAberto(false); setDraft(null); setTema(""); router.refresh(); }
      else setErro(r.erro ?? "Falha ao aplicar.");
    });
  }

  if (!aberto) {
    return (
      <Button
        onClick={() => setAberto(true)}
        disabled={!disponivel}
        title={disponivel ? "" : "IA não configurada neste ambiente"}
      >
        ✨ Gerar com IA
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !gerando && !aplicando && setAberto(false)}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-premium" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-marsala">✨ Gerar rascunho com IA</h3>
          <button onClick={() => setAberto(false)} className="text-xs text-black/40 hover:text-black/70">fechar</button>
        </div>

        <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Tema / intenção da norma</label>
        <textarea
          value={tema}
          onChange={(e) => setTema(e.target.value)}
          rows={3}
          placeholder="Ex.: Política de home office — elegibilidade, equipamentos, jornada, segurança da informação e reembolso."
          className="w-full rounded-md border border-black/15 p-3 text-sm outline-none focus:border-marsala"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={gerar} disabled={gerando || tema.trim().length < 5}>
            {gerando ? "Gerando… (pode levar alguns segundos)" : draft ? "Gerar de novo" : "Gerar rascunho"}
          </Button>
          {erro && <span className="text-xs text-red-600">{erro}</span>}
        </div>

        {draft && (
          <div className="mt-4 border-t border-black/10 pt-4">
            <p className="mb-2 text-xs text-black/50">Revise o rascunho. Ao aplicar, ele preenche as seções (você ainda edita antes de publicar).</p>
            <div className="space-y-3">
              {draft.map((s) => (
                <div key={s.codigo} className="rounded-lg border border-black/10 p-3">
                  <div className="mb-1 text-xs font-semibold text-marsala">{s.codigo}. {TITULOS[s.codigo] ?? ""}</div>
                  {Array.isArray(s.linhas) ? (
                    <table className="w-full text-xs">
                      <tbody>
                        {s.linhas.map((row, i) => (
                          <tr key={i} className="border-b border-black/5">
                            {row.map((c, j) => (<td key={j} className="px-2 py-1 align-top text-black/70">{c}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="whitespace-pre-wrap text-xs text-black/70">{s.corpo}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={aplicar} disabled={aplicando}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
                {aplicando ? "Aplicando…" : "Aplicar ao rascunho"}
              </button>
              <span className="text-[11px] text-black/40">A IA não publica — só preenche o rascunho para revisão.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
