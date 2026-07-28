import { authEnabled } from "@/lib/auth/config";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { CARGOS, rotuloCargo } from "@/lib/auth/perfis";

const DEV_PERFIS = CARGOS.map((c) => c.valor);

function iniciais(nome: string, email: string): string {
  const base = (nome || email || "AB").trim();
  const partes = base.split(/[\s@.]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "A") + (partes[1]?.[0] ?? "B")).toUpperCase();
}

export default async function Header() {
  const u = await getUsuarioAtual();
  const nomeExibicao = u?.nome || u?.email || (authEnabled ? "—" : "Dev");

  return (
    <header className="flex items-center justify-between border-b border-black/10 bg-white px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-marsala">Gestão de Políticas e Normativos</span>
        {!authEnabled && (
          <span className="rounded-full bg-bege/60 px-2 py-0.5 text-[10px] font-medium text-black/60">
            auth desativada (dev)
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {!authEnabled && (
          <form className="flex items-center gap-1" action="/api/dev/perfil" method="get">
            <label className="text-[10px] uppercase tracking-wide text-black/40">perfil dev</label>
            <select
              name="p"
              defaultValue={u?.perfil ?? "superadmin"}
              className="rounded border border-black/15 px-2 py-1 text-xs"
            >
              {DEV_PERFIS.map((p) => (
                <option key={p} value={p}>{rotuloCargo(p)}</option>
              ))}
            </select>
            <button className="rounded bg-black/10 px-2 py-1 text-xs hover:bg-black/15">trocar</button>
          </form>
        )}

        {u && (
          <span className="rounded-full bg-marsala/10 px-2.5 py-1 text-[11px] font-medium text-marsala">
            {rotuloCargo(u.perfil)}
          </span>
        )}
        <span className="text-sm text-black/60">{nomeExibicao}</span>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-marsala text-xs font-semibold text-white">
          {iniciais(u?.nome ?? "", u?.email ?? "")}
        </div>
        {authEnabled && u && (
          <a
            href="/api/auth/logout"
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/70 transition hover:bg-black/5"
          >
            Sair
          </a>
        )}
      </div>
    </header>
  );
}
