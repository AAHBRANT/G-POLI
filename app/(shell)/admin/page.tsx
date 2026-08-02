import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeAdministrar, podeGerirSetores, podeGerirConsorcios, podeGerirAdmins } from "@/lib/auth/usuario";
import LinhaUsuario from "@/components/admin/LinhaUsuario";
import ConvidarUsuarioForm from "@/components/admin/ConvidarUsuarioForm";
import GerenciarSetores from "@/components/admin/GerenciarSetores";
import GerenciarConsorcios from "@/components/admin/GerenciarConsorcios";
import { CARGOS } from "@/lib/auth/perfis";

export const dynamic = "force-dynamic";

type Params = { q?: string; cargo?: string; status?: string; tab?: string };

export default async function AdminPage({ searchParams }: { searchParams: Params }) {
  const atual = await getUsuarioAtual();
  if (!podeAdministrar(atual)) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/60">
        Acesso restrito. Somente administradores gerenciam usuários.
      </div>
    );
  }

  const gerirSetores = podeGerirSetores(atual);
  const gerirConsorcios = podeGerirConsorcios(atual);
  const gerirAdmins = podeGerirAdmins(atual);
  const ehGestorTopo = atual!.perfil === "superadmin" || atual!.perfil === "admin";

  const q = (searchParams.q ?? "").trim();
  const cargo = searchParams.cargo ?? "";
  const status = searchParams.status ?? "";
  const tab =
    searchParams.tab === "setores" && gerirSetores ? "setores" :
    searchParams.tab === "consorcios" && gerirConsorcios ? "consorcios" :
    "usuarios";

  const and: Record<string, unknown>[] = [];
  if (q) and.push({ OR: [{ nome: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] });
  if (cargo) and.push({ perfil: cargo });
  if (status === "ativo") and.push({ ativo: true });
  if (status === "inativo") and.push({ ativo: false });
  // Gestor de Setor: só enxerga usuários dos seus setores.
  if (!ehGestorTopo && atual!.setores.length) and.push({ setores: { some: { id: { in: atual!.setores } } } });

  const [usuarios, setores, consorcios] = await Promise.all([
    prisma.usuario.findMany({
      where: and.length ? { AND: and } : {},
      include: {
        setores: { select: { id: true, nome: true } },
        consorcios: { select: { id: true, nome: true } },
      },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.area.findMany({ orderBy: { nome: "asc" } }),
    prisma.consorcio.findMany({ orderBy: { nome: "asc" } }),
  ]);

  const setoresAtivos = setores.filter((s) => s.ativa).map((s) => ({ id: s.id, nome: s.nome }));
  const consorciosAtivos = consorcios.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));
  const filtroAtivo = Boolean(q || cargo || status);

  const abaClasse = (ativa: boolean) =>
    `border-b-2 px-1 py-2.5 text-sm font-medium transition ${
      ativa ? "border-marsala text-marsala" : "border-transparent text-black/50 hover:text-black/70"
    }`;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-marsala">Gestão de Usuários e Permissões</h2>
          <p className="text-sm text-black/50">
            Convite = liberação de acesso. Cargos (RBAC) e setores controlam o que cada um faz.
          </p>
        </div>
        {ehGestorTopo && tab === "usuarios" && <ConvidarUsuarioForm setores={setoresAtivos} podeAdmins={gerirAdmins} />}
      </div>

      <div className="flex items-center gap-5 border-b border-black/10">
        <Link href="/admin?tab=usuarios" className={abaClasse(tab === "usuarios")}>
          Usuários ({usuarios.length})
        </Link>
        {gerirSetores && (
          <Link href="/admin?tab=setores" className={abaClasse(tab === "setores")}>
            Setores ({setores.length})
          </Link>
        )}
        {gerirConsorcios && (
          <Link href="/admin?tab=consorcios" className={abaClasse(tab === "consorcios")}>
            Consórcios ({consorcios.length})
          </Link>
        )}
        <Link href="/admin/auditoria" className={abaClasse(false)}>
          Auditoria
        </Link>
      </div>

      {tab === "setores" ? (
        <GerenciarSetores setores={setores.map((s) => ({ id: s.id, nome: s.nome, ativa: s.ativa }))} />
      ) : tab === "consorcios" ? (
        <GerenciarConsorcios consorcios={consorcios.map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo }))} />
      ) : (
        <>
          {/* Filtros */}
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card">
            <input type="hidden" name="tab" value="usuarios" />
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Buscar</label>
              <input name="q" defaultValue={q} placeholder="Nome ou e-mail…" className="h-10 w-full rounded border border-black/15 px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Cargo</label>
              <select name="cargo" defaultValue={cargo} className="h-10 rounded border border-black/15 px-2 text-sm">
                <option value="">Todos</option>
                {CARGOS.map((c) => (<option key={c.valor} value={c.valor}>{c.rotulo}</option>))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Status</label>
              <select name="status" defaultValue={status} className="h-10 rounded border border-black/15 px-2 text-sm">
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <button className="h-10 rounded-md bg-marsala px-4 text-sm font-medium text-white hover:bg-marsala-600">Filtrar</button>
            {filtroAtivo && (
              <Link
                href="/admin"
                title="Limpar filtros"
                className="grid h-10 w-10 place-items-center rounded-md border border-black/15 text-black/50 transition hover:bg-black/5 hover:text-black/70"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </Link>
            )}
          </form>

          <div className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-card">
            <div className="border-b border-black/5 px-4 py-2 text-xs text-black/50">
              {usuarios.length} usuário{usuarios.length === 1 ? "" : "s"}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="px-4 py-2 font-medium">Nome</th>
                    <th className="px-4 py-2 font-medium">E-mail</th>
                    <th className="px-4 py-2 font-medium">Cargo</th>
                    <th className="px-4 py-2 font-medium">Setor</th>
                    <th className="px-4 py-2 font-medium">Consórcio</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Cadastro</th>
                    <th className="px-4 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {usuarios.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-black/50">Nenhum usuário para os filtros.</td></tr>
                  ) : (
                    usuarios.map((u) => (
                      <LinhaUsuario
                        key={u.id}
                        usuario={{
                          id: u.id,
                          nome: u.nome,
                          email: u.email,
                          perfil: u.perfil,
                          ativo: u.ativo,
                          pendente: !u.oid,
                          dataCadastro: u.criadoEm.toLocaleDateString("pt-BR"),
                          setores: u.setores.map((s) => ({ id: s.id, nome: s.nome })),
                          consorcios: u.consorcios.map((c) => ({ id: c.id, nome: c.nome })),
                        }}
                        setores={setoresAtivos}
                        consorcios={consorciosAtivos}
                        podeAdmins={gerirAdmins}
                        ehVoceMesmo={atual!.id === u.id}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
