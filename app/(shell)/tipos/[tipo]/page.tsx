import { notFound, redirect } from "next/navigation";
import NovaPoliticaForm from "@/components/politica/NovaPoliticaForm";
import ImportarDocumentoForm from "@/components/politica/ImportarDocumentoForm";
import BibliotecaView from "@/components/biblioteca/BibliotecaView";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { tipoDocumentoValido, tipoDocumento, artigoDocumento } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { q?: string; area?: string; estado?: string };

// Seção genérica para os 7 tipos de documento além de Política (que tem seção
// própria em /catalogo, já existente antes desta feature). Mesma visão de
// biblioteca de /catalogo.
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
  const consorciosAtivos = await prisma.consorcio.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return (
    <BibliotecaView
      base={`/tipos/${info.valor}`}
      tipoFixo={info.valor}
      titulo={info.rotuloPlural}
      descricao={info.descricao}
      searchParams={searchParams}
      acoes={
        podeCriar ? (
          <>
            <NovaPoliticaForm tipo={info.valor} consorcios={consorciosAtivos} />
            <ImportarDocumentoForm tipo={info.valor} />
          </>
        ) : undefined
      }
      vazioTotal={
        <div className="vidro rounded-2xl p-12 text-center text-sm text-black/55">
          {nenhum} {info.rotulo.toLowerCase()} {cadastrada} ainda.
          {podeCriar && (
            <>
              {" "}
              Clique em{" "}
              <strong>
                + {novo} {info.rotulo.toLowerCase()}
              </strong>{" "}
              para começar.
            </>
          )}
        </div>
      }
    />
  );
}
