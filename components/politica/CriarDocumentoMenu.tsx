"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TIPOS_DOCUMENTO } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

export default function CriarDocumentoMenu() {
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
      <Button onClick={() => setAberto((a) => !a)} className="flex items-center gap-1.5">
        + Criar documento
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition ${aberto ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>

      {aberto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-56 liquid rounded-2xl py-1">
          {TIPOS_DOCUMENTO.map((t) => (
            <Link
              key={t.valor}
              href={t.valor === "politica" ? "/catalogo" : `/tipos/${t.valor}`}
              onClick={() => setAberto(false)}
              className="block px-3 py-2 text-sm text-black/70 hover:bg-black/5"
            >
              {t.rotulo}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
