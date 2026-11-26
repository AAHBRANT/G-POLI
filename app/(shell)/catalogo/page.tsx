import NovaPoliticaForm from "@/components/politica/NovaPoliticaForm";
import ImportarDocumentoForm from "@/components/politica/ImportarDocumentoForm";
import BibliotecaView from "@/components/biblioteca/BibliotecaView";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { tipoDocumento } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { q?: string; area?: string; estado?: string };

// Políticas: seção própria (rota histórica /catalogo). Mesma visão de biblioteca
// dos demais tipos (/tipos/[tipo]).
export default async function CatalogoPage(props: { searchParams: Promise<Params> }) {
  const searchParams = await props.searchParams;
  const usuario = await getUsuarioAtual();
  const podeCriar = podeCriarPolitica(usuario);
  const info = tipoDocumento("politica");
  const consorciosAtivos = await prisma.consorcio.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  return (
    <BibliotecaView
      base="/catalogo"
      tipoFixo="politica"
      titulo={info.rotuloPlural}
      descricao={info.descricao}
      searchParams={searchParams}
      acoes={
        podeCriar ? (
          <>
            <NovaPoliticaForm tipo="politica" consorcios={consorciosAtivos} />
            <ImportarDocumentoForm tipo="politica" />
          </>
        ) : undefined
      }
      vazioTotal={
        <div className="vidro rounded-2xl p-12 text-center text-sm text-black/55">
          Nenhuma política encontrada.
          {podeCriar && (
            <>
              {" "}
              Clique em <strong>+ Nova política</strong> para começar.
            </>
          )}
        </div>
      }
    />
  );
}
