import NovaPoliticaForm from "@/components/politica/NovaPoliticaForm";
import PainelCatalogo from "@/components/politica/PainelCatalogo";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

type Params = { q?: string; area?: string; estado?: string };

export default async function CatalogoPage({ searchParams }: { searchParams: Params }) {
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);
  const q = (searchParams.q ?? "").trim();
  const areaId = searchParams.area ?? "";
  const estado = searchParams.estado ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-marsala">Catálogo de Políticas</h2>
        </div>
        {podeCriar && <NovaPoliticaForm tipo="politica" />}
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
