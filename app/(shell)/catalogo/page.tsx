import { prisma } from "@/lib/prisma";
import NovaPoliticaForm from "@/components/politica/NovaPoliticaForm";
import CatalogoTabela from "@/components/politica/CatalogoTabela";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);
  // v3: esta página é a seção "Política" — os outros 7 tipos vivem em /tipos/[tipo].
  const politicas = await prisma.politica.findMany({
    where: { tipo: "politica" },
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
        {podeCriar && <NovaPoliticaForm tipo="politica" />}
      </div>

      {politicas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white p-10 text-center text-sm text-black/50">
          Nenhuma política cadastrada. Clique em <strong>+ Nova política</strong> para começar.
        </div>
      ) : (
        <CatalogoTabela itens={politicas} />
      )}
    </div>
  );
}
