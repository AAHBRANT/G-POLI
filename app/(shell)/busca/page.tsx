import Link from "next/link";
import BibliotecaView from "@/components/biblioteca/BibliotecaView";
import { BUTTON_CLASSES } from "@/components/ui/Button";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";

export const dynamic = "force-dynamic";

type Params = { q?: string; tipo?: string; area?: string; estado?: string; alerta?: string };

// Busca geral: a mesma visão de biblioteca, sobre todos os tipos de documento
// que o perfil do usuário pode acessar.
export default async function BuscaPage(props: { searchParams: Promise<Params> }) {
  const searchParams = await props.searchParams;
  const usuario = await getUsuarioAtual();
  return (
    <BibliotecaView
      base="/busca"
      titulo="Busca"
      descricao="Procure em todos os documentos a que você tem acesso: por título, código ou conteúdo das seções."
      searchParams={searchParams}
      acoes={
        podeCriarPolitica(usuario) ? (
          <Link href="/importar" className={BUTTON_CLASSES}>
            Importar acervo
          </Link>
        ) : undefined
      }
    />
  );
}
