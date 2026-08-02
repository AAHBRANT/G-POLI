import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeAdministrar, filtroVisibilidade } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

const ACAO_ROTULO: Record<string, string> = {
  "politica.criar": "Criou política",
  "politica.publicar": "Publicou",
  "politica.revogar": "Revogou",
  "politica.reabrir": "Reabriu p/ revisão",
  "secao.salvar": "Editou seção",
  "secao.abertura": "Liberação de seção",
  "versao.upload": "Enviou versão",
  "usuario.perfil": "Alterou cargo",
  "usuario.convidar": "Convidou usuário",
  "usuario.ativo": "Ativou/desativou usuário",
  "usuario.remover": "Removeu usuário",
  "usuario.setores": "Alterou setores do usuário",
  "setor.criar": "Criou setor",
  "setor.renomear": "Renomeou setor",
  "setor.ativo": "Ativou/desativou setor",
  "consorcio.criar": "Criou consórcio",
  "consorcio.renomear": "Renomeou consórcio",
  "consorcio.ativo": "Ativou/desativou consórcio",
  "usuario.consorcios": "Alterou consórcios do usuário",
  "ciencia.dar": "Deu ciência",
  "ia.gerar": "Gerou rascunho com IA",
  "ia.aplicar": "Aplicou rascunho da IA",
};

export default async function AuditoriaPage() {
  const atual = await getUsuarioAtual();
  if (!podeAdministrar(atual)) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/60">
        Acesso restrito. A trilha de auditoria é visível apenas a administradores.
      </div>
    );
  }

  // Gestor de Setor (perfil "area") não é Super Admin/Admin: não pode ver
  // entradas de auditoria de políticas fora da sua visibilidade normal (ex.:
  // título de documento de consórcio ao qual não está vinculado — a mesma
  // regra de filtroVisibilidade usada em todo o resto do app). Super Admin e
  // Admin continuam vendo tudo, sem filtro.
  let idsPoliticasVisiveis: Set<string> | null = null;
  if (atual?.perfil === "area") {
    const politicasVisiveis = await prisma.politica.findMany({
      where: filtroVisibilidade(atual),
      select: { id: true },
    });
    idsPoliticasVisiveis = new Set(politicasVisiveis.map((p) => p.id));
  }

  const registrosBrutos = await prisma.auditoria.findMany({
    orderBy: { criadoEm: "desc" },
    take: 200,
  });

  const registros = idsPoliticasVisiveis
    ? registrosBrutos.filter(
        (r) => !(r.entidade === "Politica" && !idsPoliticasVisiveis!.has(r.entidadeId)),
      )
    : registrosBrutos;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-marsala">Auditoria</h2>
          <p className="text-sm text-black/50">Últimas 200 ações registradas (mais recentes primeiro).</p>
        </div>
        <Link href="/admin" className="text-xs text-marsala hover:underline">← Voltar à administração</Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-4 py-2 font-medium">Quando</th>
              <th className="px-4 py-2 font-medium">Quem</th>
              <th className="px-4 py-2 font-medium">Ação</th>
              <th className="px-4 py-2 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {registros.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-black/50">Nenhum registro ainda.</td>
              </tr>
            ) : (
              registros.map((r) => (
                <tr key={r.id} className="hover:bg-black/[0.02]">
                  <td className="whitespace-nowrap px-4 py-2 text-black/50">
                    {r.criadoEm.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-black/80">{r.usuarioNome || r.usuarioEmail}</div>
                    <div className="text-[11px] text-black/40">{r.perfil}</div>
                  </td>
                  <td className="px-4 py-2 text-black/70">{ACAO_ROTULO[r.acao] ?? r.acao}</td>
                  <td className="px-4 py-2 text-black/60">{r.detalhe || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
