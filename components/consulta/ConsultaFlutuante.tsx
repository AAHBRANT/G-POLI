"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { Fonte } from "@/lib/consulta/regras";

type Mensagem = { id: number; papel: "usuario" | "assistente"; texto: string; fontes?: Fonte[]; erro?: boolean };

const CHAVE_SESSAO = "gpol_consulta_sessao";
const SUGESTOES = [
  "Qual o procedimento de codificação de documentos?",
  "Quem aprova uma política antes de publicar?",
  "O que preciso para registrar um treinamento?",
];

// Texto do agente: quebras de linha preservadas e **negrito** simples (sem HTML solto).
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("\n").map((linha, i) => (
        <p key={i} className={linha.trim() === "" ? "h-2" : ""}>
          {linha.split(/(\*\*[^*]+\*\*)/g).map((parte, j) =>
            parte.startsWith("**") && parte.endsWith("**") ? <strong key={j}>{parte.slice(2, -2)}</strong> : <span key={j}>{parte}</span>,
          )}
        </p>
      ))}
    </>
  );
}

// Bola flutuante de consulta (Guuly): pergunte sobre as políticas e os
// procedimentos e receba a resposta com as fontes (código, revisão e seção).
// A resposta só usa documentos vigentes que ESTA pessoa pode ver (o servidor
// aplica a permissão); a conversa continua na mesma sessão até "Nova conversa".
export default function ConsultaFlutuante() {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const proximoId = useRef(1);
  const sessaoId = useRef<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessaoId.current = sessionStorage.getItem(CHAVE_SESSAO);
    } catch {
      /* sem armazenamento: cada abertura começa uma conversa nova */
    }
  }, []);

  useEffect(() => {
    if (aberto) entrada.current?.focus();
  }, [aberto]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, status]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const novaConversa = useCallback(() => {
    sessaoId.current = null;
    try {
      sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      /* ignora */
    }
    setMensagens([]);
    setStatus(null);
  }, []);

  async function enviar(perguntaBruta: string) {
    const pergunta = perguntaBruta.trim();
    if (!pergunta || ocupado) return;
    const idUsuario = proximoId.current++;
    const idAssistente = proximoId.current++;
    setMensagens((m) => [...m, { id: idUsuario, papel: "usuario", texto: pergunta }, { id: idAssistente, papel: "assistente", texto: "" }]);
    setTexto("");
    setOcupado(true);
    setStatus("Pensando…");

    const atualizar = (parcial: Partial<Mensagem>) =>
      setMensagens((m) => m.map((x) => (x.id === idAssistente ? { ...x, ...parcial } : x)));

    try {
      const r = await fetch("/api/consulta", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mensagem: pergunta, sessaoId: sessaoId.current }),
      });
      if (!r.ok || !r.body) {
        const dados = await r.json().catch(() => ({}));
        atualizar({ texto: dados?.erro ?? "Não foi possível consultar agora.", erro: true });
        return;
      }
      const leitor = r.body.getReader();
      const decodificador = new TextDecoder();
      let sobra = "";
      let resposta = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        sobra += decodificador.decode(value, { stream: true });
        const linhas = sobra.split("\n");
        sobra = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha);
          if (ev.tipo === "sessao") {
            sessaoId.current = ev.id;
            try {
              sessionStorage.setItem(CHAVE_SESSAO, ev.id);
            } catch {
              /* ignora */
            }
          } else if (ev.tipo === "status") setStatus(ev.texto);
          else if (ev.tipo === "mensagem") {
            resposta += (resposta ? "\n\n" : "") + ev.texto;
            atualizar({ texto: resposta });
            setStatus(null);
          } else if (ev.tipo === "fontes") atualizar({ fontes: ev.fontes });
          else if (ev.tipo === "erro") atualizar({ texto: resposta ? resposta + "\n\n" + ev.texto : ev.texto, erro: true });
        }
      }
    } catch {
      atualizar({ texto: "Falha de conexão. Tente de novo.", erro: true });
    } finally {
      setOcupado(false);
      setStatus(null);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        <AnimatePresence>
          {aberto && (
            <motion.section
              role="dialog"
              aria-label="Consulta de políticas e procedimentos"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              style={{ transformOrigin: "bottom right" }}
              className="liquid relative flex h-[min(38rem,calc(100vh-7rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl bg-bege-50/80"
            >
              <header className="flex items-center gap-3 border-b border-black/10 bg-bege/60 px-4 py-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-sm font-bold text-black/80 ring-1 ring-black/10">G</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <h2 className="text-sm font-semibold text-black/85">Guuly · Consulta</h2>
                  <p className="truncate text-[11px] text-black/55">Políticas e procedimentos da AAHBRANT</p>
                </div>
                {mensagens.length > 0 && (
                  <button
                    type="button"
                    onClick={novaConversa}
                    disabled={ocupado}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-black/60 hover:bg-black/5 hover:text-black disabled:opacity-40"
                  >
                    Nova conversa
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  aria-label="Fechar consulta"
                  className="grid h-8 w-8 place-items-center rounded-full text-black/50 hover:bg-black/5 hover:text-black"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
                {mensagens.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-black/65">
                      Pergunte sobre as políticas, normas e procedimentos vigentes. Respondo com a fonte (código, revisão e seção)
                      e só uso os documentos a que você tem acesso.
                    </p>
                    <div className="flex flex-col gap-2">
                      {SUGESTOES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => enviar(s)}
                          className="rounded-xl bg-white/60 px-3 py-2 text-left text-[13px] text-black/75 ring-1 ring-black/10 transition hover:bg-white/90"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  mensagens.map((m) => (
                    <div key={m.id} className={m.papel === "usuario" ? "flex justify-end" : "flex justify-start"}>
                      <div
                        className={`max-w-[88%] space-y-2 rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                          m.papel === "usuario"
                            ? "bg-bege text-black/85 ring-1 ring-black/10"
                            : m.erro
                              ? "bg-red-100/80 text-red-900"
                              : "bg-white/75 text-black/80 ring-1 ring-black/5"
                        }`}
                      >
                        {m.texto ? <Texto texto={m.texto} /> : <span className="text-black/40">…</span>}
                        {m.fontes && m.fontes.length > 0 && (
                          <div className="border-t border-black/10 pt-2">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-black/45">Fontes</p>
                            <ul className="space-y-1">
                              {m.fontes.map((f) => (
                                <li key={f.politicaId + f.secao}>
                                  <Link href={`/catalogo/${f.politicaId}`} className="block rounded-lg bg-bege/60 px-2 py-1 text-[11px] text-black/80 hover:bg-bege">
                                    <span className="font-mono font-semibold">{f.codigo ?? "sem código"}</span> · {f.titulo} · Rev. {f.revisao} · seção {f.secao}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {status && (
                  <p className="flex items-center gap-2 text-xs text-black/50" role="status">
                    <span className="flex h-3 items-end gap-[2px]">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="an-barra block h-full w-[3px] rounded-full bg-black/60" style={{ animationDelay: `${i * 0.12}s` }} />
                      ))}
                    </span>
                    {status}
                  </p>
                )}
                <div ref={fim} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar(texto);
                }}
                className="flex items-end gap-2 border-t border-black/10 bg-white/40 p-3"
              >
                <textarea
                  ref={entrada}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      enviar(texto);
                    }
                  }}
                  maxLength={1000}
                  rows={1}
                  placeholder="Pergunte sobre um procedimento…"
                  aria-label="Sua pergunta"
                  className="max-h-28 min-h-10 flex-1 resize-none rounded-xl bg-white/80 px-3 py-2 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-black/50"
                />
                <button
                  type="submit"
                  disabled={ocupado || !texto.trim()}
                  className="h-10 rounded-xl bg-bege px-4 text-sm font-semibold text-black/85 ring-1 ring-black/10 transition hover:bg-bege-300 disabled:opacity-50"
                >
                  Enviar
                </button>
              </form>
            </motion.section>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => setAberto((a) => !a)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 500, damping: 24 }}
          aria-label={aberto ? "Fechar consulta" : "Abrir consulta de políticas e procedimentos"}
          aria-expanded={aberto}
          className="liquid liquid-bege relative grid h-14 w-14 place-items-center rounded-full text-black/85 outline-none focus-visible:ring-2 focus-visible:ring-black/60"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
            <path d="M9 11h6M9 14h4" />
          </svg>
        </motion.button>
      </div>
    </MotionConfig>
  );
}
