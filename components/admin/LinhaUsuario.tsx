"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirPerfil, definirSetores, definirConsorcios, alternarAtivo, removerUsuario } from "@/app/(shell)/admin/actions";
import { CARGOS, CARGOS_PRIVILEGIADOS, rotuloCargo } from "@/lib/auth/perfis";
import { Button } from "@/components/ui/Button";

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
  consorcios: Setor[]; // mesmo shape {id, nome} — reaproveita o tipo Setor
};

export default function LinhaUsuario({
  usuario,
  setores,
  consorcios,
  podeAdmins,
  gerirConsorcios,
  ehVoceMesmo,
}: {
  usuario: U;
  setores: Setor[];
  consorcios: Setor[];
  podeAdmins: boolean;
  gerirConsorcios: boolean;
  ehVoceMesmo: boolean;
}) {
  const router = useRouter();
  const [perfil, setPerfil] = useState(usuario.perfil);
  const [pendentePerfil, setPendentePerfil] = useState<string | null>(null);
  const [editSet, setEditSet] = useState(false);
  const [sel, setSel] = useState<string[]>(usuario.setores.map((s) => s.id));
  const [editConsorcio, setEditConsorcio] = useState(false);
  const [selConsorcio, setSelConsorcio] = useState<string[]>(usuario.consorcios.map((c) => c.id));
  const [msg, setMsg] = useState<null | "ok" | "erro">(null);
  const [erroTxt, setErroTxt] = useState<string | null>(null);
  const [confirmandoRemover, setConfirmandoRemover] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [pend, iniciar] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const cargosDisponiveis = CARGOS.filter((c) => podeAdmins || !CARGOS_PRIVILEGIADOS.includes(c.valor));

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function agir(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setMsg(null); setErroTxt(null);
    iniciar(async () => {
      const r = await fn();
      if (r.ok) { setMsg("ok"); router.refresh(); }
      else { setMsg("erro"); setErroTxt(r.erro ?? "Falha."); }
    });
  }

  function confirmarPerfil() {
    if (!pendentePerfil) return;
    const novo = pendentePerfil;
    setPendentePerfil(null);
    setPerfil(novo);
    agir(() => definirPerfil(usuario.id, novo));
  }

  function toggleSel(id: string) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function salvarSetores() {
    agir(() => definirSetores(usuario.id, sel));
    setEditSet(false);
  }
  function toggleSelConsorcio(id: string) {
    setSelConsorcio((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function salvarConsorcios() {
    agir(() => definirConsorcios(usuario.id, selConsorcio));
    setEditConsorcio(false);
  }

  // Convite pendente costuma ter nome = e-mail (placeholder até a pessoa
  // logar pela 1a vez) — mostrar os dois campos idênticos lado a lado é
  // redundante, então a coluna Nome fica em branco nesse caso.
  const nomeExibido = usuario.nome && usuario.nome !== usuario.email ? usuario.nome : "—";

  return (
    <tr className={`align-top hover:bg-black/[0.02] ${!usuario.ativo ? "opacity-60" : ""}`}>
      <td className="px-4 py-2">
        <div className="font-medium text-black/80">{nomeExibido}{ehVoceMesmo && <span className="ml-1.5 text-[10px] font-normal text-black/40">(você)</span>}</div>
        {usuario.pendente && <span className="text-[10px] text-amber-700">convite pendente</span>}
      </td>
      <td className="px-4 py-2 text-black/60">{usuario.email}</td>
      <td className="px-4 py-2">
        <select
          value={perfil}
          onChange={(e) => setPendentePerfil(e.target.value)}
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
              <Button onClick={salvarSetores} disabled={pend}>Salvar</Button>
              <button onClick={() => setEditSet(false)} className="text-[11px] text-black/50">cancelar</button>
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        {!editConsorcio ? (
          <div className="flex flex-wrap items-center gap-1">
            {usuario.consorcios.length === 0 ? (
              <span className="text-xs text-black/30">—</span>
            ) : (
              usuario.consorcios.map((c) => (
                <span key={c.id} className="rounded-full bg-marsala-50 px-2 py-0.5 text-[10px] font-medium text-marsala">{c.nome}</span>
              ))
            )}
            {gerirConsorcios && (
              <button onClick={() => { setSelConsorcio(usuario.consorcios.map((x) => x.id)); setEditConsorcio(true); }} className="ml-1 text-[11px] text-marsala hover:underline">editar</button>
            )}
          </div>
        ) : (
          <div className="w-56 rounded border border-black/15 p-2">
            <div className="mb-2 flex flex-wrap gap-1">
              {consorcios.map((c) => (
                <button key={c.id} type="button" onClick={() => toggleSelConsorcio(c.id)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] transition ${selConsorcio.includes(c.id) ? "border-marsala bg-marsala text-white" : "border-black/15 text-black/60 hover:bg-black/5"}`}>
                  {c.nome}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={salvarConsorcios} disabled={pend} className="rounded bg-marsala px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60">Salvar</button>
              <button onClick={() => setEditConsorcio(false)} className="text-[11px] text-black/50">cancelar</button>
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${usuario.ativo ? "bg-emerald-50 text-emerald-700" : "bg-black/10 text-black/50"}`}>
          {usuario.ativo ? "Ativo" : "Inativo"}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-black/50">{usuario.dataCadastro}</td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {!ehVoceMesmo ? (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuAberto((a) => !a)}
                disabled={pend}
                title="Ações"
                className="grid h-7 w-7 place-items-center rounded text-black/50 hover:bg-black/5 hover:text-black/80 disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
              </button>
              {menuAberto && (
                <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-black/10 bg-white py-1 shadow-premium">
                  <button
                    onClick={() => { setMenuAberto(false); agir(() => alternarAtivo(usuario.id, !usuario.ativo)); }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-black/70 hover:bg-black/5"
                  >
                    {usuario.ativo ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => { setMenuAberto(false); setConfirmandoRemover(true); }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-black/30">—</span>
          )}
          {msg === "ok" && <span className="text-xs text-emerald-700">✓</span>}
          {msg === "erro" && <span className="text-[11px] text-red-600" title={erroTxt ?? ""}>erro</span>}
        </div>

        {pendentePerfil && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
              <p className="text-sm text-black/80">
                Mudar cargo de <strong>{usuario.nome || usuario.email}</strong> de{" "}
                <strong>{rotuloCargo(perfil)}</strong> para <strong>{rotuloCargo(pendentePerfil)}</strong>?
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setPendentePerfil(null)}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5"
                >
                  Cancelar
                </button>
                <Button onClick={confirmarPerfil}>Confirmar</Button>
              </div>
            </div>
          </div>
        )}

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
