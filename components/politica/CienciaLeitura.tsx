"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { darCiencia } from "@/app/(shell)/catalogo/[id]/ciencia-actions";

type SecaoLeitura = {
  codigo: string;
  titulo: string;
  tipo: string;
  corpo: string;
  colunas: string[] | null;
  linhas: string[][] | null;
};

// Trava de rolagem: o botão de confirmar só libera quando a área de leitura
// chega ao fim (ou já cabe inteira na tela, sem precisar rolar). Isso é UX,
// não segurança — quem chamar a Server Action direto contorna. A única
// checagem que o servidor de fato valida é o tempo mínimo desde a abertura
// (ver comentário em ciencia-actions.ts).
const MARGEM_FIM_PX = 5;

export default function CienciaLeitura({
  politicaId,
  secoes,
  jaCiente = false,
}: {
  politicaId: string;
  secoes: SecaoLeitura[];
  // Depois de já ter dado ciência, o botão sumia de vez — sem nenhum jeito de
  // reler o texto oficial pela tela normal (só via editor, se tivesse
  // permissão). Nesse modo o modal só mostra o conteúdo, sem gate de
  // rolagem nem confirmação — já foi confirmado antes.
  jaCiente?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [chegouAoFim, setChegouAoFim] = useState(false);
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function abrir() {
    setErro(null);
    setChegouAoFim(false);
    setAbertoEm(new Date().toISOString());
    setAberto(true);
  }

  function checarFim(el: HTMLDivElement) {
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + MARGEM_FIM_PX) {
      setChegouAoFim(true);
    }
  }

  // Conteúdo curto que já cabe sem rolar: libera direto ao renderizar.
  function aoMontarArea(el: HTMLDivElement | null) {
    if (el) checarFim(el);
  }

  function confirmar() {
    if (!abertoEm) return;
    setErro(null);
    iniciar(async () => {
      const r = await darCiencia(politicaId, abertoEm);
      if (r.ok) {
        setAberto(false);
        router.refresh();
      } else {
        setErro(r.erro ?? "Falha.");
      }
    });
  }

  return (
    <>
      <button
        onClick={abrir}
        className={
          jaCiente
            ? "rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5"
            : "rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800"
        }
      >
        {jaCiente ? "Ver conteúdo" : "Li e estou ciente"}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="border-b border-black/10 px-5 py-3">
              <h3 className="text-sm font-semibold text-black/80">Termo de ciência de leitura</h3>
              <p className="text-xs text-black/45">
                Role até o final do documento para liberar a confirmação.
              </p>
            </div>

            <div
              ref={aoMontarArea}
              onScroll={(e) => checarFim(e.currentTarget)}
              className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-black/80"
            >
              {secoes.length === 0 ? (
                <p className="text-black/50">Documento sem conteúdo estruturado.</p>
              ) : (
                secoes.map((s) => (
                  <div key={s.codigo}>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-marsala">
                      {s.codigo} · {s.titulo}
                    </h4>
                    {s.tipo === "tabela" ? (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          {s.colunas && s.colunas.length > 0 && (
                            <thead>
                              <tr>
                                {s.colunas.map((c, i) => (
                                  <th key={i} className="border border-black/10 bg-black/5 px-2 py-1 text-left font-medium">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                          )}
                          <tbody>
                            {(s.linhas ?? []).map((linha, i) => (
                              <tr key={i}>
                                {linha.map((cel, j) => (
                                  <td key={j} className="border border-black/10 px-2 py-1">{cel}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{s.corpo || "—"}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-3">
              <span className="text-xs text-black/45">
                {jaCiente
                  ? "Você já confirmou ciência desta norma."
                  : chegouAoFim ? "✅ Leitura concluída." : "⚠️ Role até o final para continuar."}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setAberto(false)}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
                >
                  Fechar
                </button>
                {!jaCiente && (
                  <button
                    onClick={confirmar}
                    disabled={!chegouAoFim || pendente}
                    className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pendente ? "…" : "Confirmar ciência"}
                  </button>
                )}
              </div>
            </div>
            {erro && <p className="px-5 pb-3 text-xs text-red-600">{erro}</p>}
          </div>
        </div>
      )}
    </>
  );
}
