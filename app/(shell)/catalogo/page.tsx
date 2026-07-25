import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NovaPoliticaForm from "@/components/NovaPoliticaForm";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { corClassificacao, rotuloClassificacao, ESTADOS_POLITICA } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);
  const politicas = await prisma.politica.findMany({
    include: { area: true, _count: { select: { versoes: true } } },
    orderBy: { criadaEm: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-marsala">Catálogo de Normas</h2>
          <p className="text-sm text-black/50">
            {politicas.length} {politicas.length === 1 ? "política" : "políticas"} cadastrada
            {politicas.length === 1 ? "" : "s"}
          </p>
        </div>
        {podeCriar && <NovaPoliticaForm />}
      </div>

      {politicas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white p-10 text-center text-sm text-black/50">
          Nenhuma política cadastrada. Clique em <strong>+ Nova política</strong> para começar.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Título</th>
                <th className="px-4 py-3 font-medium">Área</th>
                <th className="px-4 py-3 font-medium">Classificação</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Versões</th>
                <th className="px-4 py-3 font-medium">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {politicas.map((p) => {
                const estado = ESTADOS_POLITICA[p.estado] ?? { rotulo: p.estado, cor: "" };
                return (
                  <tr key={p.id} className="hover:bg-black/[0.02]">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded bg-marsala-50 px-2 py-0.5 font-mono text-[11px] font-medium text-marsala">
                        {p.codigo ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/catalogo/${p.id}`} className="text-marsala hover:underline">
                        {p.titulo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-black/70">{p.area.nome}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${corClassificacao(p.classificacao)}`}>
                        {rotuloClassificacao(p.classificacao)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${estado.cor}`}>
                        {estado.rotulo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-black/60">{p._count.versoes}</td>
                    <td className="px-4 py-3 text-black/50">
                      {p.criadaEm.toLocaleDateString("pt-BR")}
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
