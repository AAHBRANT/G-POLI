"use client";

import { useEffect, useState } from "react";

// Tenta SSO silencioso quando o app está embutido no Teams.
// Fora do Teams, não faz nada (o usuário usa o botão de login web).
export default function TeamsSso() {
  const [estado, setEstado] = useState<"tentando" | "fora" | "erro" | "sem_acesso">("tentando");
  const [motivo, setMotivo] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      // O initialize é o que distingue "não está no Teams" de "está no Teams e
      // o SSO falhou". Antes os dois caíam no mesmo catch silencioso, e uma
      // falha real de SSO ficava indistinguível de uso no navegador — foi o que
      // atrasou o diagnóstico do login travado na aba do Teams.
      let teams: typeof import("@microsoft/teams-js") | null = null;
      try {
        const mod = await import("@microsoft/teams-js");
        await mod.app.initialize();
        teams = mod;
      } catch {
        if (!cancelado) setEstado("fora");
        return;
      }

      try {
        const token = await teams.authentication.getAuthToken();
        if (cancelado) return;

        const r = await fetch("/api/auth/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (r.ok) {
          window.location.href = "/";
        } else if (r.status === 403) {
          setEstado("sem_acesso");
        } else {
          setEstado("erro");
          setMotivo(`servidor respondeu ${r.status}`);
        }
      } catch (e) {
        // Está no Teams, mas o SSO silencioso não passou. Não é fim de linha: o
        // botão abaixo entra pelo popup. Mostrar o motivo para não voltarmos a
        // depurar no escuro.
        if (cancelado) return;
        setEstado("erro");
        setMotivo(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  if (estado === "tentando") {
    return <p className="text-sm text-black/50">Tentando entrar pelo Teams…</p>;
  }
  if (estado === "sem_acesso") {
    return (
      <p className="text-sm text-red-600">
        Seu e-mail não tem acesso ao G-Políticas. Solicite liberação ao administrador.
      </p>
    );
  }
  if (estado === "erro") {
    return (
      <div className="text-sm text-black/60">
        <p>Entrada automática indisponível. Use o botão abaixo.</p>
        {motivo && (
          <p className="mt-1 text-xs text-black/40" title={motivo}>
            Motivo: {motivo}
          </p>
        )}
      </div>
    );
  }
  return null;
}
