"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarDocumento } from "@/app/(shell)/catalogo/actions";
import { tipoDocumento, artigoDocumento, type TipoDocumentoValor } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

// Sprint 1 (upload e transformação): botão irmão de NovaPoliticaForm — cria
// uma política a partir de um arquivo (.docx/.pdf/.txt/.md) OU de texto
// colado direto, em vez de começar do esqueleto padrão. NovaPoliticaForm
// não foi alterado.
export default function ImportarDocumentoForm({ tipo = "politica" }: { tipo?: TipoDocumentoValor }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const info = tipoDocumento(tipo);
  const { novo } = artigoDocumento(info);

  function onSubmit(formData: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await importarDocumento(formData);
      if (r.ok && r.id) {
        setAberto(false);
        router.push(`/catalogo/${r.id}`);
      } else {
        setErro(r.erro ?? "Erro desconhecido.");
      }
    });
  }

  if (!aberto) {
    return (
      <Button
        onClick={() => setAberto(true)}
        className="border border-marsala !bg-white !text-marsala hover:!bg-marsala hover:!text-white"
      >
        Importar arquivo
      </Button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="rounded-lg border border-black/10 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-4 text-sm font-semibold text-marsala">
        Importar {info.rotulo.toLowerCase()} de arquivo ou texto
      </h3>
      <input type="hidden" name="tipo" value={tipo} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-black/60">Título</span>
          <input
            name="titulo"
            type="text"
            required
            placeholder={`Ex.: ${info.exemplo}`}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-marsala"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-black/60">Área responsável</span>
          <input
            name="area"
            type="text"
            required
            placeholder="Ex.: TI"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-marsala"
          />
        </label>

        <label className="block sm:col-span-3">
          <span className="mb-1 block text-xs text-black/60">Arquivo (.docx, .pdf, .txt ou .md — até 10 MB)</span>
          <input
            name="arquivo"
            type="file"
            accept=".docx,.pdf,.txt,.md"
            className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-marsala file:px-3 file:py-1.5 file:text-white hover:file:bg-marsala-600"
          />
        </label>

        <div className="flex items-center gap-3 sm:col-span-3">
          <div className="h-px flex-1 bg-black/10" />
          <span className="text-[11px] uppercase tracking-wide text-black/40">ou</span>
          <div className="h-px flex-1 bg-black/10" />
        </div>

        <label className="block sm:col-span-3">
          <span className="mb-1 block text-xs text-black/60">Colar o texto do documento</span>
          <textarea
            name="texto"
            rows={6}
            placeholder="Cole aqui o conteúdo copiado do Word/e-mail/etc."
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-marsala"
          />
        </label>

        <input type="hidden" name="classificacao" value="publico_interno" />
      </div>

      {erro && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Importando…" : "Importar"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
          className="rounded-md border border-black/15 px-4 py-2 text-sm text-black/70 transition hover:bg-black/5"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
