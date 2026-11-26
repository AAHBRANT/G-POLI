"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Visualizar o documento SEM baixar (mesmo padrão do G-SST/PGR). O PDF é desenhado
// em <canvas> pelo pdf.js, porque <iframe>/<object> com PDF fica em branco dentro do
// Teams (o WebView não tem o leitor de PDF do navegador). Usa o build "legacy" do
// pdf.js, que traz os polyfills que WebViews mais antigos do Teams exigem. O pdf.js
// só é baixado quando alguém abre um documento (import dinâmico).

function PaginasPdf({ url, aoErro }: { url: string; aoErro: (m: string) => void }) {
  const contentor = useRef<HTMLDivElement>(null);
  const [carregando, setCarregando] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const alvo = contentor.current;
    if (!alvo) return undefined;
    alvo.replaceChildren();

    (async () => {
      try {
        const resposta = await fetch(url, { credentials: "same-origin" });
        if (!resposta.ok) throw new Error(resposta.status === 404 ? "Documento não encontrado ou sem acesso." : "Não foi possível carregar o documento.");
        const dados = new Uint8Array(await resposta.arrayBuffer());

        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const tarefa = pdfjs.getDocument({ data: dados });
        const documento = await tarefa.promise;
        if (cancelado) {
          void tarefa.destroy();
          return;
        }
        setTotal(documento.numPages);

        const largura = Math.max(alvo.clientWidth - 56, 280);
        const densidade = window.devicePixelRatio || 1;
        for (let n = 1; n <= documento.numPages; n++) {
          if (cancelado) break;
          const pagina = await documento.getPage(n);
          const base = pagina.getViewport({ scale: 1 });
          const viewport = pagina.getViewport({ scale: largura / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * densidade);
          canvas.height = Math.floor(viewport.height * densidade);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 12px";
          canvas.style.background = "#fff";
          canvas.style.boxShadow = "0 1px 4px rgba(0,0,0,.25)";
          canvas.setAttribute("aria-label", `Página ${n} de ${documento.numPages}`);
          alvo.appendChild(canvas);
          await pagina.render({
            canvas,
            viewport,
            transform: densidade !== 1 ? [densidade, 0, 0, densidade, 0, 0] : undefined,
          }).promise;
          pagina.cleanup();
          if (n === 1) setCarregando(false);
        }
        void tarefa.destroy();
      } catch (e) {
        if (!cancelado) aoErro(e instanceof Error ? e.message : "Falha ao exibir o documento.");
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [url, aoErro]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {carregando && (
        <p role="status" className="py-12 text-center text-sm text-black/60">
          Carregando documento…
        </p>
      )}
      <div ref={contentor} className="min-h-0 flex-1 overflow-auto rounded-xl bg-black/5 p-4" />
      {total > 1 && <p className="pt-2 text-center text-xs text-black/50">{total} páginas</p>}
    </div>
  );
}

export default function VisualizadorPdf({
  documentoId,
  titulo,
  nomeArquivo,
  className,
}: {
  documentoId: string;
  titulo: string;
  nomeArquivo: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const url = `/api/documentos/${documentoId}`;

  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("keydown", aoTeclar);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  return (
    <>
      <button type="button" onClick={() => { setErro(null); setAberto(true); }} className={className}>
        Visualizar
      </button>
      {aberto &&
        createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" onClick={() => setAberto(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="liquid flex h-[92vh] w-full max-w-5xl flex-col rounded-2xl p-4 sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="truncate text-base font-semibold">{titulo}</h2>
              <div className="flex shrink-0 gap-2">
                <a href={url} download={nomeArquivo} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-black/5">
                  Baixar
                </a>
                <button type="button" onClick={() => setAberto(false)} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-black/5" autoFocus>
                  Fechar
                </button>
              </div>
            </div>
            {erro ? (
              <p role="alert" className="py-12 text-center text-sm font-medium text-red-700">
                {erro}
              </p>
            ) : (
              <PaginasPdf url={url} aoErro={setErro} />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
