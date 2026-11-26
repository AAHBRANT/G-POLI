"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePendencias } from "@/lib/hooks/usePendencias";
import { tipoDocumento } from "@/lib/constants";
import type { ItemPendencia } from "@/app/api/pendencias/lista/route";
import { nivelUrgenciaPendencia, classesUrgenciaPendencia } from "@/lib/politica/lembretesPendentes";

export default function SinoNotificacoes() {
  const { total, carregando } = usePendencias();
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemPendencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroLista, setErroLista] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Mesmo padrão de fechar-ao-clicar-fora de components/shell/MenuPerfil.tsx.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function alternar() {
    const proximoAberto = !aberto;
    setAberto(proximoAberto);
    if (!proximoAberto) return;

    setBuscando(true);
    setErroLista(false);
    try {
      const resposta = await fetch("/api/pendencias/lista");
      if (resposta.ok) {
        const corpo: { itens: ItemPendencia[] } = await resposta.json();
        setItens(corpo.itens);
      } else {
        console.error("Falha ao buscar lista de pendencias: status", resposta.status);
        setItens([]);
        setErroLista(true);
      }
    } catch (erro) {
      console.error("Falha ao buscar lista de pendencias:", erro);
      setItens([]);
      setErroLista(true);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={alternar} className="relative rounded-full p-2 transition hover:bg-black/5" aria-label="Notificações">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
        </svg>
        {!carregando && total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1 text-[9px] font-medium text-white">
            {total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-72 liquid rounded-2xl py-1">
          <div className="border-b border-black/5 px-3 py-2 text-[11px] uppercase tracking-wide text-black/40">
            Pendências{itens.length > 0 ? ` (${itens.length})` : ""}
          </div>
          {buscando ? (
            <p className="px-3 py-4 text-center text-sm text-black/40">Carregando...</p>
          ) : erroLista ? (
            <p className="px-3 py-4 text-center text-sm text-black/40">Não foi possível carregar suas pendências. Tente novamente.</p>
          ) : itens.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-black/40">Nenhuma pendência.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {itens.map((it) => {
                const nivel = nivelUrgenciaPendencia(new Date(it.criadaEm), new Date());
                const classes = classesUrgenciaPendencia(nivel);
                return (
                  <li key={it.id} className={`border border-t border-black/5 first:border-t-0 ${classes}`}>
                    <Link href={`/catalogo/${it.politicaId}`} className="block px-3 py-2 hover:bg-black/5">
                      <div className="text-sm text-black/80">{it.titulo}</div>
                      <div className="mt-0.5 text-[11px] text-black/40">{tipoDocumento(it.tipo).rotulo}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
