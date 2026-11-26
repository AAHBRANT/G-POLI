// Página pública de Termos de Uso — referenciada pelo manifest do Teams
// (developer.termsOfUseUrl). Fora do route group (shell): não exige login.
// TEXTO PLACEHOLDER — deve ser validado pelo jurídico antes de considerar
// definitivo.
export const metadata = { title: "Termos de Uso — G-Políticas" };

export default function TermosPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-800">
      <div className="mb-8 h-1 w-16 rounded bg-bege-400" />
      <h1 className="mb-2 text-2xl font-semibold text-black/85">Termos de Uso</h1>
      <p className="mb-8 text-sm text-neutral-500">G-Políticas — AAHBRANT Engenharia &amp; Construções</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <p>
          O G-Políticas é de uso interno e restrito aos colaboradores autorizados
          da AAHBRANT. O acesso é pessoal e intransferível.
        </p>
        <h2 className="pt-2 font-semibold text-neutral-900">Uso aceitável</h2>
        <p>
          O sistema destina-se a cadastrar, revisar, publicar e consultar normas
          internas. É vedado usar o conteúdo para fins não autorizados ou divulgá-lo
          fora da organização sem permissão.
        </p>
        <h2 className="pt-2 font-semibold text-neutral-900">Conteúdo oficial</h2>
        <p>
          Apenas normas no estado <strong>Publicada</strong> constituem texto
          oficial vigente. Rascunhos e versões revogadas não valem como norma em
          vigor.
        </p>
        <h2 className="pt-2 font-semibold text-neutral-900">Responsabilidades</h2>
        <p>
          O colaborador é responsável pelo uso adequado do sistema e pela ciência
          das normas que lhe forem aplicáveis.
        </p>
        <p className="pt-6 text-xs text-neutral-400">
          Documento em elaboração — sujeito a validação jurídica.
        </p>
      </section>
    </main>
  );
}
