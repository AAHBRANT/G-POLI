"use client";

import { useState, useTransition, useRef } from "react";
import { adicionarVersao } from "@/app/(shell)/catalogo/[id]/actions";

export default function NovaVersaoForm({ politicaId }: { politicaId: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await adicionarVersao(politicaId, formData);
      if (r.ok) ref.current?.reset();
      else setErro(r.erro ?? "Erro.");
    });
  }

  return (
    <form
      ref={ref}
      action={onSubmit}
      className="rounded-lg border border-black/10 bg-white p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-marsala">Nova versão</h3>
      <div className="flex flex-wrap items-center gap-3">
        <input
          name="arquivo"
          type="file"
          required
          accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg"
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-marsala file:px-3 file:py-1.5 file:text-white hover:file:bg-marsala-600"
        />
        <button
          type="submit"
          disabled={pendente}
          className="rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600 disabled:opacity-60"
        >
          {pendente ? "Enviando…" : "Enviar documento"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-black/40">
        PDF, Word, Excel ou imagem · até 25 MB · original preservado com hash.
      </p>
      {erro && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}
    </form>
  );
}
