import { authEnabled } from "@/lib/auth/config";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { CARGOS, rotuloCargo } from "@/lib/auth/perfis";
import Breadcrumb from "@/components/shell/Breadcrumb";
import MenuPerfil from "@/components/shell/MenuPerfil";
import SinoNotificacoes from "@/components/shell/SinoNotificacoes";

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
    <header className="flex items-center justify-between vidro sticky top-0 z-30 border-b border-white/60 px-6 py-3">
      <div className="flex items-center gap-3">
        <Breadcrumb />
        {!authEnabled && (
          <span className="rounded-full bg-bege/60 px-2 py-0.5 text-[10px] font-medium text-black/60">
            auth desativada (dev)
          </span>
        )}
      </div>

      <form action="/busca" method="get" role="search" className="mx-4 hidden max-w-md flex-1 sm:block">
        <label htmlFor="busca-global" className="sr-only">
          Buscar políticas, normas e procedimentos
        </label>
        <div className="liquid flex items-center gap-2 rounded-full px-4 py-1.5 focus-within:ring-2 focus-within:ring-black/30">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-black/50">
            <path d="M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z" />
          </svg>
          <input
            id="busca-global"
            name="q"
            type="search"
            placeholder="Buscar documento, código ou assunto…"
            autoComplete="off"
            className="w-full bg-transparent text-sm outline-none placeholder:text-black/45"
          />
        </div>
      </form>

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

        {u && <SinoNotificacoes />}

        {u && (
          <MenuPerfil
            nome={nomeExibicao}
            cargoRotulo={rotuloCargo(u.perfil)}
            iniciais={iniciais(u.nome ?? "", u.email ?? "")}
            authEnabled={authEnabled}
          />
        )}
      </div>
    </header>
  );
}
