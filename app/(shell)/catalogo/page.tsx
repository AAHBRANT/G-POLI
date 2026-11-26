import NovaPoliticaForm from "@/components/politica/NovaPoliticaForm";
import ImportarDocumentoForm from "@/components/politica/ImportarDocumentoForm";
import PainelCatalogo from "@/components/politica/PainelCatalogo";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { q?: string; area?: string; estado?: string };

export default async function CatalogoPage(props: { searchParams: Promise<Params> }) {
  const searchParams = await props.searchParams;
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);
  const q = (searchParams.q ?? "").trim();
  const areaId = searchParams.area ?? "";
  const estado = searchParams.estado ?? "";
  const consorciosAtivos = await prisma.consorcio.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-marsala">Catálogo de Políticas</h2>
        </div>
        {podeCriar && (
          <div className="flex items-center gap-2">
            <NovaPoliticaForm tipo="politica" consorcios={consorciosAtivos} />
            <ImportarDocumentoForm tipo="politica" />
          </div>
        )}
      </div>

      <PainelCatalogo
        tipo="politica"
        action="/catalogo"
        q={q}
        areaId={areaId}
        estado={estado}
        mensagemVazio={
          <div className="rounded-lg border border-dashed border-black/15 bg-white p-10 text-center text-sm text-black/50">
            Nenhuma política encontrada. Clique em <strong>+ Nova política</strong> para começar.
          </div>
        }
      />
    </div>
  );
}
