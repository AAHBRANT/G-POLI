import { prisma } from "@/lib/prisma";
import { getUsuarioAtual, podeCriarPolitica } from "@/lib/auth/usuario";
import { tipoDocumentoValido, type TipoDocumentoValor } from "@/lib/constants";
import ImportarLote from "@/components/politica/ImportarLote";

export const dynamic = "force-dynamic";

// Importação em lote do acervo (SGI/admin): vários arquivos de uma vez, cada um
// virando um rascunho. A permissão é a mesma de criar documento.
export default async function ImportarPage(props: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await props.searchParams;
  const usuario = await getUsuarioAtual();

  if (!podeCriarPolitica(usuario)) {
    return (
      <div className="liquid relative mx-auto max-w-3xl rounded-2xl p-8 text-center text-sm text-black/60">
        Acesso restrito. Somente o SGI e administradores importam documentos.
      </div>
    );
  }

  const areas = await prisma.area.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { nome: true } });
  const tipoPadrao: TipoDocumentoValor | "" = tipo && tipoDocumentoValido(tipo) ? tipo : "";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="space-y-1 px-1">
        <h1 className="text-2xl font-semibold tracking-tight text-black/85">Importar acervo</h1>
        <p className="max-w-2xl text-sm text-black/60">
          Escolha vários arquivos de uma vez. O sistema sugere o tipo, a área e o título pelo nome do arquivo (por exemplo,
          <span className="font-mono text-xs"> AHBT-PRO-QUA-001_Controle-de-Documentos.docx</span>); confira e ajuste antes de importar.
          O código normativo é sempre gerado pelo sistema.
        </p>
      </header>
      <ImportarLote areas={areas.map((a) => a.nome)} tipoPadrao={tipoPadrao} />
    </div>
  );
}
