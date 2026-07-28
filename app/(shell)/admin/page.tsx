import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeAdministrar, podeGerirSetores, podeGerirAdmins } from "@/lib/auth/usuario";
import LinhaUsuario from "@/components/admin/LinhaUsuario";
import ConvidarUsuarioForm from "@/components/admin/ConvidarUsuarioForm";
import GerenciarSetores from "@/components/admin/GerenciarSetores";
import { CARGOS } from "@/lib/auth/perfis";

export const dynamic = "force-dynamic";

type Params = { q?: string; cargo?: string; status?: string };

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
  const gerirAdmins = podeGerirAdmins(atual);
  const ehGestorTopo = atual!.perfil === "superadmin" || atual!.perfil === "admin";

  const q = (searchParams.q ?? "").trim();
  const cargo = searchParams.cargo ?? "";
  const status = searchParams.status ?? "";

  const and: Record<string, unknown>[] = [];
  if (q) and.push({ OR: [{ nome: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] });
  if (cargo) and.push({ perfil: cargo });
  if (status === "ativo") and.push({ ativo: true });
  if (status === "inativo") and.push({ ativo: false });
  // Gestor de Setor: só enxerga usuários dos seus setores.
  if (!ehGestorTopo && atual!.setores.length) and.push({ setores: { some: { id: { in: atual!.setores } } } });

  const [usuarios, setores] = await Promise.all([
    prisma.usuario.findMany({
      where: and.length ? { AND: and } : {},
      include: { setores: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: "asc" },
    }),
    prisma.area.findMany({ orderBy: { nome: "asc" } }),
  ]);

  const setoresAtivos = setores.filter((s) => s.ativa).map((s) => ({ id: s.id, nome: s.nome }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-marsala">Gestão de Usuários e Permissões</h2>
          <p className="text-sm text-black/50">
            Convite = liberação de acesso. Cargos (RBAC) e setores controlam o que cada um faz.
          </p>
        </div>
        <Link href="/admin/auditoria" className="shrink-0 rounded-md border border-black/15 px-3 py-1.5 text-xs text-black/70 transition hover:bg-black/5">
          Ver auditoria →
        </Link>
      </div>

      {gerirSetores && <GerenciarSetores setores={setores.map((s) => ({ id: s.id, nome: s.nome, ativa: s.ativa }))} />}

      {ehGestorTopo && <ConvidarUsuarioForm setores={setoresAtivos} podeAdmins={gerirAdmins} />}

      {/* Filtros */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Buscar</label>
          <input name="q" defaultValue={q} placeholder="Nome ou e-mail…" className="w-full rounded border border-black/15 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Cargo</label>
          <select name="cargo" defaultValue={cargo} className="rounded border border-black/15 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {CARGOS.map((c) => (<option key={c.valor} value={c.valor}>{c.rotulo}</option>))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Status</label>
          <select name="status" defaultValue={status} className="rounded border border-black/15 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <button className="rounded-md bg-marsala px-4 py-1.5 text-sm font-medium text-white hover:bg-marsala-600">Filtrar</button>
        <Link href="/admin" className="text-xs text-black/40 hover:text-black/70">limpar</Link>
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
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Cadastro</th>
                <th className="px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {usuarios.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-black/50">Nenhum usuário para os filtros.</td></tr>
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
                    }}
                    setores={setoresAtivos}
                    podeAdmins={gerirAdmins}
                    ehVoceMesmo={atual!.id === u.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
