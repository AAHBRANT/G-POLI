import BibliotecaView from "@/components/biblioteca/BibliotecaView";

export const dynamic = "force-dynamic";

type Params = { q?: string; tipo?: string; area?: string; estado?: string };

// Busca geral: a mesma visão de biblioteca, sobre todos os tipos de documento
// que o perfil do usuário pode acessar.
export default async function BuscaPage(props: { searchParams: Promise<Params> }) {
  const searchParams = await props.searchParams;
  return (
    <BibliotecaView
      base="/busca"
      titulo="Busca"
      descricao="Procure em todos os documentos a que você tem acesso: por título, código ou conteúdo das seções."
      searchParams={searchParams}
    />
  );
}
