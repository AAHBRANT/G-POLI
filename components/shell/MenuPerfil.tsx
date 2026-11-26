"use client";

import { useEffect, useRef, useState } from "react";

export default function MenuPerfil({
  nome,
  cargoRotulo,
  iniciais,
  authEnabled,
}: {
  nome: string;
  cargoRotulo: string;
  iniciais: string;
  authEnabled: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-black/5"
      >
        <div className="grid h-8 w-8 place-items-center rounded-full bg-bege ring-1 ring-black/10 text-xs font-semibold text-black/85">
          {iniciais}
        </div>
        <span className="text-sm text-black/70">{nome}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-black/40 transition ${aberto ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-48 liquid rounded-2xl py-1">
          <div className="border-b border-black/5 px-3 py-2">
            <div className="text-sm font-medium text-black/80">{nome}</div>
            <span className="mt-1 inline-block rounded-full bg-bege/70 px-2 py-0.5 text-[10px] font-medium text-marsala">
              {cargoRotulo}
            </span>
          </div>
          {authEnabled && (
            <a href="/api/auth/logout" className="block px-3 py-2 text-sm text-black/70 hover:bg-black/5">
              Sair
            </a>
          )}
        </div>
      )}
    </div>
  );
}
