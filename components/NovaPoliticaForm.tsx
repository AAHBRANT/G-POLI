"use client";

import { useState, useTransition } from "react";
import { criarPolitica } from "@/app/(shell)/catalogo/actions";
import { CLASSIFICACOES } from "@/lib/constants";

export default function NovaPoliticaForm() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function onSubmit(formData: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await criarPolitica(formData);
      if (r.ok) {
        setAberto(false);
      } else {
        setErro(r.erro ?? "Erro desconhecido.");
      }
    });
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600"
      >
        + Nova política
      </button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="rounded-lg border border-black/10 bg-white p-5 shadow-sm"
    >
      <h3 className="mb-4 text-sm font-semibold text-marsala">Nova política</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-black/60">Título</span>
          <input
            name="titulo"
            type="text"
            required
            placeholder="Ex.: Política de Segurança da Informação"
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
            list="areas-sugeridas"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-marsala"
          />
          <datalist id="areas-sugeridas">
            <option value="Direção" />
            <option value="TI" />
            <option value="RH" />
            <option value="Jurídico" />
            <option value="Engenharia" />
          </datalist>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs text-black/60">Classificação</span>
          <select
            name="classificacao"
            defaultValue="publico_interno"
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-marsala"
          >
            {CLASSIFICACOES.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={pendente}
          className="rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600 disabled:opacity-60"
        >
          {pendente ? "Salvando…" : "Salvar política"}
        </button>
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
