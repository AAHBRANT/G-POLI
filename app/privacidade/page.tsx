// Página pública de Privacidade — referenciada pelo manifest do Teams
// (developer.privacyUrl). Fora do route group (shell): não exige login.
// TEXTO PLACEHOLDER — deve ser validado pelo jurídico/DPO antes de considerar
// definitivo (LGPD). Ver decisão de adiamento em memory do projeto.
export const metadata = { title: "Privacidade — G-Políticas" };

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-neutral-800">
      <div className="mb-8 h-1 w-16 rounded bg-[#670000]" />
      <h1 className="mb-2 text-2xl font-semibold text-[#670000]">Política de Privacidade</h1>
      <p className="mb-8 text-sm text-neutral-500">G-Políticas — AAHBRANT Engenharia &amp; Construções</p>

      <section className="space-y-4 text-sm leading-relaxed">
        <p>
          O G-Políticas é um sistema interno da AAHBRANT para gestão de documentos
          normativos. Ele trata apenas os dados necessários para autenticar o
          colaborador e registrar seu uso do sistema.
        </p>
        <h2 className="pt-2 font-semibold text-neutral-900">Dados tratados</h2>
        <p>
          Identificação corporativa (nome e e-mail do Microsoft Entra ID), o perfil
          de acesso e os registros de auditoria e de ciência de leitura das normas.
        </p>
        <h2 className="pt-2 font-semibold text-neutral-900">Finalidade</h2>
        <p>
          Controlar o acesso, atribuir responsabilidades sobre as normas e manter
          trilha de quem leu e quem publicou cada documento.
        </p>
        <h2 className="pt-2 font-semibold text-neutral-900">Contato</h2>
        <p>
          Dúvidas sobre o tratamento de dados devem ser encaminhadas ao
          responsável interno pelo sistema.
        </p>
        <p className="pt-6 text-xs text-neutral-400">
          Documento em elaboração — sujeito a validação jurídica/LGPD.
        </p>
      </section>
    </main>
  );
}
