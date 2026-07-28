"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirPerfil, definirSetores, alternarAtivo, removerUsuario } from "@/app/(shell)/admin/actions";
import { CARGOS, CARGOS_PRIVILEGIADOS } from "@/lib/auth/perfis";

type Setor = { id: string; nome: string };
type U = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  pendente: boolean;
  dataCadastro: string;
  setores: Setor[];
};

export default function LinhaUsuario({
  usuario,
  setores,
  podeAdmins,
  ehVoceMesmo,
}: {
  usuario: U;
  setores: Setor[];
  podeAdmins: boolean;
  ehVoceMesmo: boolean;
}) {
  const router = useRouter();
  const [perfil, setPerfil] = useState(usuario.perfil);
  const [editSet, setEditSet] = useState(false);
  const [sel, setSel] = useState<string[]>(usuario.setores.map((s) => s.id));
  const [msg, setMsg] = useState<null | "ok" | "erro">(null);
  const [erroTxt, setErroTxt] = useState<string | null>(null);
  const [confirmandoRemover, setConfirmandoRemover] = useState(false);
  const [pend, iniciar] = useTransition();

  const cargosDisponiveis = CARGOS.filter((c) => podeAdmins || !CARGOS_PRIVILEGIADOS.includes(c.valor));

  function agir(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setMsg(null); setErroTxt(null);
    iniciar(async () => {
      const r = await fn();
      if (r.ok) { setMsg("ok"); router.refresh(); }
      else { setMsg("erro"); setErroTxt(r.erro ?? "Falha."); }
    });
  }

  function toggleSel(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function salvarSetores() {
    agir(() => definirSetores(usuario.id, sel));
    setEditSet(false);
  }

  return (
    <tr className={`align-top hover:bg-black/[0.02] ${!usuario.ativo ? "opacity-60" : ""}`}>
      <td className="px-4 py-2">
        <div className="font-medium text-black/80">{usuario.nome || "—"}</div>
        {usuario.pendente && <span className="text-[10px] text-amber-700">convite pendente</span>}
      </td>
      <td className="px-4 py-2 text-black/60">{usuario.email}</td>
      <td className="px-4 py-2">
        <select
          value={perfil}
          onChange={(e) => { const v = e.target.value; setPerfil(v); agir(() => definirPerfil(usuario.id, v)); }}
          className="rounded border border-black/15 px-2 py-1 text-sm"
        >
          {cargosDisponiveis.map((c) => (<option key={c.valor} value={c.valor}>{c.rotulo}</option>))}
          {!cargosDisponiveis.some((c) => c.valor === perfil) && (
            <option value={perfil}>{CARGOS.find((c) => c.valor === perfil)?.rotulo ?? perfil}</option>
          )}
        </select>
      </td>
      <td className="px-4 py-2">
        {!editSet ? (
          <div className="flex flex-wrap items-center gap-1">
            {usuario.setores.length === 0 ? (
              <span className="text-xs text-black/30">—</span>
            ) : (
              usuario.setores.map((s) => (
                <span key={s.id} className="rounded-full bg-marsala-50 px-2 py-0.5 text-[10px] font-medium text-marsala">{s.nome}</span>
              ))
            )}
            <button onClick={() => { setSel(usuario.setores.map((x) => x.id)); setEditSet(true); }} className="ml-1 text-[11px] text-marsala hover:underline">editar</button>
          </div>
        ) : (
          <div className="w-56 rounded border border-black/15 p-2">
            <div className="mb-2 flex flex-wrap gap-1">
              {setores.map((s) => (
                <button key={s.id} type="button" onClick={() => toggleSel(s.id)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition ${sel.includes(s.id) ? "border-marsala bg-marsala text-white" : "border-black/15 text-black/60 hover:bg-black/5"}`}>
                  {s.nome}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={salvarSetores} disabled={pend} className="rounded bg-marsala px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60">Salvar</button>
              <button onClick={() => setEditSet(false)} className="text-[11px] text-black/50">cancelar</button>
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${usuario.ativo ? "bg-emerald-100 text-emerald-800" : "bg-black/10 text-black/50"}`}>
          {usuario.ativo ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-black/50">{usuario.dataCadastro}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {!ehVoceMesmo ? (
            <>
              <button onClick={() => agir(() => alternarAtivo(usuario.id, !usuario.ativo))} disabled={pend}
                className="rounded border border-black/15 px-2 py-1 text-[11px] text-black/70 hover:bg-black/5 disabled:opacity-60">
                {usuario.ativo ? "Desativar" : "Ativar"}
              </button>
              <button onClick={() => setConfirmandoRemover(true)} disabled={pend}
                className="rounded px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-60">
                Remover
              </button>
            </>
          ) : (
            <span className="text-[10px] text-black/30">(você)</span>
          )}
          {msg === "ok" && <span className="text-xs text-emerald-700">✓</span>}
          {msg === "erro" && <span className="text-[11px] text-red-600" title={erroTxt ?? ""}>erro</span>}
        </div>

        {confirmandoRemover && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <p className="text-sm text-black/80">Remover {usuario.email}? Revoga o acesso.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmandoRemover(false)}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { setConfirmandoRemover(false); agir(() => removerUsuario(usuario.id)); }}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
