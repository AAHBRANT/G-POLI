import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, filtroVisibilidade } from "@/lib/auth/usuario";
import { corClassificacao, rotuloClassificacao, ESTADOS_POLITICA, tipoDocumento } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

type Params = { q?: string; area?: string; estado?: string };

export default async function BuscaPage({ searchParams }: { searchParams: Params }) {
  const usuario = await getUsuarioAtual();
  const q = (searchParams.q ?? "").trim();
  const areaId = searchParams.area ?? "";
  const estado = searchParams.estado ?? "";

  const areas = await prisma.area.findMany({ orderBy: { nome: "asc" } });

  // Monta o where: visibilidade por perfil + filtros do formulário.
  const and: Record<string, unknown>[] = [filtroVisibilidade(usuario)];
  if (areaId) and.push({ areaId });
  if (estado) and.push({ estado });
  if (q) {
    // Busca também no conteúdo de tabelas (linhas JSON) via texto — Prisma não filtra
    // substring em Json arbitrário, então buscamos os ids por SQL cru.
    const linhasMatch = await prisma.$queryRaw<{ politicaId: string }[]>`
      SELECT DISTINCT "politicaId" FROM "Secao" WHERE "linhas"::text ILIKE ${"%" + q + "%"}
    `;
    const idsTabela = linhasMatch.map((r) => r.politicaId);
    and.push({
      OR: [
        { titulo: { contains: q, mode: "insensitive" } },
        { secoes: { some: { corpo: { contains: q, mode: "insensitive" } } } },
        ...(idsTabela.length ? [{ id: { in: idsTabela } }] : []),
      ],
    });
  }

  // Só executa a busca quando há algum critério (evita despejar tudo no primeiro acesso).
  const temCriterio = Boolean(q || areaId || estado);
  const resultados = temCriterio
    ? await prisma.politica.findMany({
        where: { AND: and },
        include: { area: true },
        orderBy: [{ estado: "asc" }, { titulo: "asc" }],
        take: 100,
      })
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-marsala">Busca de Normas</h2>
        <p className="text-sm text-black/50">
          Procure por título ou conteúdo das seções. Você vê apenas as normas permitidas ao seu perfil.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Texto</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Título ou conteúdo…"
            className="w-full rounded border border-black/15 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Área</label>
          <select name="area" defaultValue={areaId} className="rounded border border-black/15 px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-black/40">Estado</label>
          <select name="estado" defaultValue={estado} className="rounded border border-black/15 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="em_aprovacao_gestor">Aguardando Gestor</option>
            <option value="em_aprovacao_diretoria">Aguardando Diretoria</option>
            <option value="publicada">Publicada</option>
            <option value="revogada">Revogada</option>
          </select>
        </div>
        <Button>Buscar</Button>
      </form>

      {!temCriterio ? (
        <p className="rounded-lg border border-dashed border-black/15 bg-white p-8 text-center text-sm text-black/50">
          Informe um texto ou filtro e clique em <strong>Buscar</strong>.
        </p>
      ) : resultados.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/15 bg-white p-8 text-center text-sm text-black/50">
          Nenhuma norma encontrada para os critérios.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
          <div className="border-b border-black/5 px-4 py-2 text-xs text-black/50">
            {resultados.length} resultado{resultados.length === 1 ? "" : "s"}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-2 font-medium">Norma</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 font-medium">Área</th>
                <th className="px-4 py-2 font-medium">Classificação</th>
                <th className="px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {resultados.map((p) => {
                const est = ESTADOS_POLITICA[p.estado] ?? { rotulo: p.estado, cor: "" };
                return (
                  <tr key={p.id} className="hover:bg-black/[0.02]">
                    <td className="px-4 py-2">
                      <Link href={`/catalogo/${p.id}`} className="font-medium text-marsala hover:underline">
                        {p.titulo}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-black/60">{tipoDocumento(p.tipo).rotulo}</td>
                    <td className="px-4 py-2 text-black/60">{p.area.nome}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${corClassificacao(p.classificacao)}`}>
                        {rotuloClassificacao(p.classificacao)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${est.cor}`}>
                        {est.rotulo}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
