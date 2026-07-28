import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import NovaPoliticaForm from "@/components/NovaPoliticaForm";
import CatalogoTabela from "@/components/CatalogoTabela";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { tipoDocumentoValido, tipoDocumento, artigoDocumento } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Seção genérica para os 7 tipos de documento além de Política (que tem seção
// própria em /catalogo, já existente antes desta feature).
export default async function TipoDocumentoPage({ params }: { params: { tipo: string } }) {
  if (!tipoDocumentoValido(params.tipo)) notFound();
  if (params.tipo === "politica") redirect("/catalogo");

  const info = tipoDocumento(params.tipo);
  const { artigo, novo, nenhum, cadastrada } = artigoDocumento(info);
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);
  const itens = await prisma.politica.findMany({
    where: { tipo: params.tipo },
    include: { area: true, _count: { select: { versoes: true } } },
    orderBy: { criadaEm: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-marsala">{info.rotuloPlural}</h2>
          <p className="text-sm text-black/50">{info.descricao}</p>
        </div>
        {podeCriar && <NovaPoliticaForm tipo={info.valor} />}
      </div>

      {itens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white p-10 text-center text-sm text-black/50">
          {nenhum} {info.rotulo.toLowerCase()} {cadastrada} ainda. Clique em{" "}
          <strong>+ {novo} {info.rotulo.toLowerCase()}</strong> para começar.
        </div>
      ) : (
        <CatalogoTabela itens={itens} />
      )}
    </div>
  );
}
