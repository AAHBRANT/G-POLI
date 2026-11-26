import { notFound, redirect } from "next/navigation";
import NovaPoliticaForm from "@/components/politica/NovaPoliticaForm";
import ImportarDocumentoForm from "@/components/politica/ImportarDocumentoForm";
import PainelCatalogo from "@/components/politica/PainelCatalogo";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { tipoDocumentoValido, tipoDocumento, artigoDocumento } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { q?: string; area?: string; estado?: string };

// Seção genérica para os 7 tipos de documento além de Política (que tem seção
// própria em /catalogo, já existente antes desta feature).
export default async function TipoDocumentoPage(props: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<Params>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  if (!tipoDocumentoValido(params.tipo)) notFound();
  if (params.tipo === "politica") redirect("/catalogo");

  const info = tipoDocumento(params.tipo);
  const { novo, nenhum, cadastrada } = artigoDocumento(info);
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
          <h2 className="text-lg font-semibold text-marsala">{info.rotuloPlural}</h2>
          <p className="text-sm text-black/50">{info.descricao}</p>
        </div>
        {podeCriar && (
          <div className="flex items-center gap-2">
            <NovaPoliticaForm tipo={info.valor} consorcios={consorciosAtivos} />
            <ImportarDocumentoForm tipo={info.valor} />
          </div>
        )}
      </div>

      <PainelCatalogo
        tipo={info.valor}
        action={`/tipos/${info.valor}`}
        q={q}
        areaId={areaId}
        estado={estado}
        mensagemVazio={
          <div className="rounded-lg border border-dashed border-black/15 bg-white p-10 text-center text-sm text-black/50">
            {nenhum} {info.rotulo.toLowerCase()} {cadastrada} ainda. Clique em{" "}
            <strong>+ {novo} {info.rotulo.toLowerCase()}</strong> para começar.
          </div>
        }
      />
    </div>
  );
}
