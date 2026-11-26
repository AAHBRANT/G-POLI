"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { hrefBiblioteca, type ParamsBiblioteca } from "@/lib/politica/biblioteca";
import { useBiblioteca } from "./PainelBiblioteca";

const EXEMPLOS = [
  "codificação de documentos",
  "rastreabilidade de materiais",
  "segurança no trabalho",
  "controle de não conformidades",
  "código de ética",
];

// Busca ao vivo: filtra enquanto a pessoa digita (espera 280 ms de pausa).
// Microinterações: a caixa "respira" ao ganhar foco (mola), o exemplo no campo
// vazio troca com deslize, as barrinhas indicam que a lista está atualizando e
// "/" leva o foco para cá de qualquer lugar da página.
export default function BuscaBiblioteca({
  base,
  params,
}: {
  base: string;
  params: ParamsBiblioteca;
}) {
  const { navegar, pendente } = useBiblioteca();
  const [texto, setTexto] = useState(params.q);
  const [focado, setFocado] = useState(false);
  const [exemplo, setExemplo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const ultimoEnviado = useRef(params.q);

  // Se o filtro mudou por fora (ex.: "Limpar filtros"), acompanha.
  useEffect(() => {
    setTexto(params.q);
    ultimoEnviado.current = params.q;
  }, [params.q]);

  useEffect(() => {
    const t = texto.trim();
    if (t === ultimoEnviado.current) return;
    const id = setTimeout(() => {
      ultimoEnviado.current = t;
      navegar(hrefBiblioteca(base, params, { q: t }));
    }, 280);
    return () => clearTimeout(id);
  }, [texto, params, navegar, base]);

  useEffect(() => {
    const id = setInterval(() => setExemplo((e) => (e + 1) % EXEMPLOS.length), 3400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (e.key === "/" && !digitando && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        entrada.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <motion.form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const t = texto.trim();
        ultimoEnviado.current = t;
        navegar(hrefBiblioteca(base, params, { q: t }));
      }}
      animate={{ scale: focado ? 1.012 : 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`liquid relative flex h-14 items-center rounded-2xl pl-5 pr-3 transition-shadow duration-300 ${
        focado ? "ring-[3px] ring-black/70" : ""
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`shrink-0 transition-colors ${focado ? "text-black" : "text-black/40"}`} aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>

      <div className="relative ml-3 h-full flex-1">
        <input
          ref={entrada}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setFocado(true)}
          onBlur={() => setFocado(false)}
          maxLength={100}
          aria-label="Buscar na biblioteca por título, código ou conteúdo"
          className="peer h-full w-full bg-transparent text-[15px] text-black/85 outline-none"
          autoComplete="off"
        />
        {!texto && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex w-full items-center overflow-hidden text-[15px] text-black/40" aria-hidden>
            <span className="mr-1.5 shrink-0">Buscar</span>
            <span className="relative h-[1.4em] min-w-0 flex-1 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={exemplo}
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  exit={{ y: "-100%", opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
                  className="absolute inset-0 truncate italic"
                >
                  “{EXEMPLOS[exemplo]}”
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
        )}
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-2">
        <AnimatePresence initial={false}>
          {pendente && (
            <motion.span
              key="carregando"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="flex h-5 items-end gap-[3px]"
              role="status"
              aria-label="Atualizando resultados"
            >
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="an-barra block h-full w-[3px] rounded-full bg-black/80" style={{ animationDelay: `${i * 0.12}s` }} />
              ))}
            </motion.span>
          )}
          {texto && !pendente && (
            <motion.button
              key="limpar"
              type="button"
              initial={{ opacity: 0, scale: 0.6, rotate: -45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.6, rotate: 45 }}
              whileTap={{ scale: 0.85 }}
              onClick={() => {
                setTexto("");
                entrada.current?.focus();
              }}
              aria-label="Limpar busca"
              className="grid h-8 w-8 place-items-center rounded-full text-black/45 transition hover:bg-black/5 hover:text-black/70"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
        <kbd
          className={`hidden rounded-md border border-black/15 px-1.5 py-0.5 font-mono text-[11px] text-black/40 transition-opacity sm:block ${focado || texto ? "opacity-0" : "opacity-100"}`}
          aria-hidden
        >
          /
        </kbd>
      </div>
    </motion.form>
  );
}
