"use client";

import { useEffect, useState } from "react";

// Tenta SSO silencioso quando o app está embutido no Teams.
// Fora do Teams, não faz nada (o usuário usa o botão de login web).
export default function TeamsSso() {
  const [estado, setEstado] = useState<"tentando" | "fora" | "erro" | "sem_acesso">("tentando");

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const { app, authentication } = await import("@microsoft/teams-js");
        await app.initialize();
        const token = await authentication.getAuthToken();
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
        }
      } catch {
        // Não está no Teams (ou SSO indisponível) → fallback web.
        if (!cancelado) setEstado("fora");
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
      <p className="text-sm text-red-600">
        Falha no SSO do Teams. Use o botão abaixo.
      </p>
    );
  }
  return null;
}
