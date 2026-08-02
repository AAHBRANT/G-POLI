"use client";

import { useState } from "react";
import DocumentoRenderizado, { type SecaoRenderizada } from "@/components/politica/DocumentoRenderizado";

// Versão substituída: mostra o conteúdo que ela tinha (snapshot gravado no
// momento da criação — ver Versao.conteudoSnapshot), sem servir nenhum
// arquivo. Download genuinamente impossível — não é só uma questão de rótulo
// do botão (ver docs/superpowers/specs/2026-08-02-versao-substituida-ver-nao-baixar-design.md).
export default function VerVersaoAntiga({
  secoes,
  tituloPolitica,
  areaNome,
  codigo,
  publicadaEm,
  revisao,
}: {
  secoes: SecaoRenderizada[];
  tituloPolitica: string;
  areaNome: string;
  codigo: string | null;
  publicadaEm: Date;
  revisao: number;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 transition hover:bg-black/5"
      >
        Ver
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
            />
            <div className="flex items-center justify-between gap-3 border-t border-black/10 px-5 py-3">
              <span className="text-xs text-amber-700">
                Versão substituída — somente leitura, download indisponível.
              </span>
              <button
                onClick={() => setAberto(false)}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
