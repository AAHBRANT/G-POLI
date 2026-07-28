"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convidarUsuario } from "@/app/(shell)/admin/actions";
import { CARGOS, CARGOS_PRIVILEGIADOS } from "@/lib/auth/perfis";

type Setor = { id: string; nome: string };

export default function ConvidarUsuarioForm({
  setores,
  podeAdmins,
}: {
  setores: Setor[];
  podeAdmins: boolean; // pode atribuir Super Admin / Admin
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("colaborador");
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const cargosDisponiveis = CARGOS.filter((c) => podeAdmins || !CARGOS_PRIVILEGIADOS.includes(c.valor));

  function toggle(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function enviar() {
    setMsg(null);
    iniciar(async () => {
      const r = await convidarUsuario(nome, email, cargo, cargo === "area" ? sel : sel);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: "Usuário convidado — acesso liberado." });
        setNome(""); setEmail(""); setCargo("colaborador"); setSel([]);
        router.refresh();
      } else setMsg({ tipo: "erro", texto: r.erro ?? "Falha." });
    });
  }

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600">
        + Convidar usuário
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-black/80">Convidar usuário</h3>
        <button onClick={() => setAberto(false)} className="text-xs text-black/40 hover:text-black/70">fechar</button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[170px] flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded border border-black/15 px-3 py-1.5 text-sm" />
        </div>
        <div className="min-w-[210px] flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">E-mail corporativo</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="nome@aahbrant.com" className="w-full rounded border border-black/15 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Cargo inicial</label>
          <select value={cargo} onChange={(e) => setCargo(e.target.value)} className="rounded border border-black/15 px-2 py-1.5 text-sm">
            {cargosDisponiveis.map((c) => (<option key={c.valor} value={c.valor}>{c.rotulo}</option>))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Setores (pode selecionar vários)</label>
        {setores.length === 0 ? (
          <p className="text-xs text-black/40">Nenhum setor cadastrado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {setores.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${sel.includes(s.id) ? "border-marsala bg-marsala text-white" : "border-black/15 text-black/60 hover:bg-black/5"}`}
              >
                {s.nome}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={enviar} disabled={pendente} className="rounded-md bg-marsala px-4 py-2 text-sm font-medium text-white transition hover:bg-marsala-600 disabled:opacity-60">
          {pendente ? "Convidando…" : "Convidar"}
        </button>
        {msg && <span className={`text-xs ${msg.tipo === "ok" ? "text-emerald-700" : "text-red-600"}`}>{msg.texto}</span>}
      </div>
    </div>
  );
}
