"use client";

import { useState } from "react";

// Botão de login que se comporta conforme o contexto.
//
// Fora do Teams: navega para /api/auth/login (fluxo web de sempre).
//
// Dentro do Teams: o app roda num iframe, e o endpoint de autorização do Entra
// responde `X-Frame-Options: DENY` — um redirect de página inteira ali resulta
// em frame em branco, sem erro visível. O jeito suportado é
// `authentication.authenticate()`, que abre uma JANELA (não iframe), onde a tela
// da Microsoft renderiza normalmente. O popup termina em /entrar/teams-fim, que
// notifica o Teams; aí recarregamos a aba já com sessão.
//
// A decisão é tomada no clique, não na montagem: se a detecção do host falhasse
// silenciosamente antes, o clique cairia no caminho errado.
export default function BotaoEntrar() {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function entrar() {
    setErro(null);
    setOcupado(true);

    let teams: typeof import("@microsoft/teams-js") | null = null;
    try {
      const mod = await import("@microsoft/teams-js");
      await mod.app.initialize();
      teams = mod;
    } catch {
      // Não está embutido no Teams → fluxo web normal.
      window.location.href = "/api/auth/login";
      return;
    }

    try {
      await teams.authentication.authenticate({
        url: `${window.location.origin}/api/auth/login?teams=1`,
        width: 600,
        height: 700,
      });
      // Sessão criada no popup; a aba recarrega autenticada.
      window.location.href = "/";
    } catch {
      // Popup fechado, cancelado ou login não concluído. Não cair no redirect
      // de página inteira: dentro do iframe ele só produziria tela em branco.
      setErro("Login não concluído. Toque em Entrar para tentar de novo.");
      setOcupado(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={entrar}
        disabled={ocupado}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-marsala px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition hover:bg-marsala-600 disabled:opacity-60"
      >
        <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
          <path fill="#fff" d="M1 1h10v10H1z" opacity=".9" />
          <path fill="#fff" d="M12 1h10v10H12z" opacity=".65" />
          <path fill="#fff" d="M1 12h10v10H1z" opacity=".65" />
          <path fill="#fff" d="M12 12h10v10H12z" opacity=".4" />
        </svg>
        {ocupado ? "Entrando…" : "Entrar com Microsoft"}
      </button>
      {erro && <p className="mt-3 text-center text-sm text-red-600">{erro}</p>}
    </>
  );
}
