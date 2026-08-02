"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { darCiencia } from "@/app/(shell)/catalogo/[id]/ciencia-actions";
import DocumentoRenderizado, { type SecaoRenderizada } from "@/components/politica/DocumentoRenderizado";

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
  codigo,
  tituloPolitica,
  areaNome,
  publicadaEm,
  revisao,
}: {
  politicaId: string;
  secoes: SecaoRenderizada[];
  // Depois de já ter dado ciência, o botão sumia de vez — sem nenhum jeito de
  // reler o texto oficial pela tela normal (só via editor, se tivesse
  // permissão). Nesse modo o modal só mostra o conteúdo, sem gate de
  // rolagem nem confirmação — já foi confirmado antes.
  jaCiente?: boolean;
  // Cabeçalho/rodapé institucional (Manual de Padronização Documental, cap.
  // 11-12) — mesmo modelo de todo documento oficial da AAHBRANT. Campo
  // "Página X de Y" do Manual foi omitido de propósito: o modal é uma tela
  // rolável, sem paginação real, e mostrar um número sem significado seria
  // pior do que não mostrar nada. Campo "Unidade" fica em branco por ora
  // (decisão explícita, pendente de valor definitivo).
  codigo: string | null;
  tituloPolitica: string;
  areaNome: string;
  publicadaEm: Date | null;
  revisao: number;
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
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <DocumentoRenderizado
              secoes={secoes}
              tituloPolitica={tituloPolitica}
              areaNome={areaNome}
              codigo={codigo}
              publicadaEm={publicadaEm}
              revisao={revisao}
              onScroll={(e) => checarFim(e.currentTarget)}
              scrollRef={aoMontarArea}
            />

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
