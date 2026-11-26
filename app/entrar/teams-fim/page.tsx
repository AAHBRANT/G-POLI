import FecharPopupTeams from "@/components/auth/FecharPopupTeams";
import { hostRedirectConfiavel } from "@/lib/auth/estado";

export const dynamic = "force-dynamic";

// Última parada do login feito no popup do Teams. A sessão já foi criada pelo
// callback do OAuth; aqui só avisamos o Teams para fechar o popup e devolver o
// controle à aba, que então recarrega já autenticada.
//
// Rota pública (ver middleware.ts): ela roda ANTES de o app validar sessão, e
// o popup é uma janela própria — barrá-la travaria o login pela metade.
export default async function TeamsFimPage(props: {
  searchParams: Promise<{ authId?: string; metodo?: string; host?: string }>;
}) {
  const searchParams = await props.searchParams;
  // Revalida no servidor antes de entregar ao cliente. O callback já filtrou,
  // mas esta página é pública e acessível direto — quem chamar não pode induzir
  // um redirect para host arbitrário (open redirect).
  const host = hostRedirectConfiavel(searchParams.host) ? searchParams.host : undefined;

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="vidro rounded-2xl px-8 py-6 text-center">
        <p className="text-sm text-black/60">Login concluído. Voltando ao Teams…</p>
        <FecharPopupTeams
          authId={searchParams.authId}
          metodo={searchParams.metodo}
          hostRedirectUrl={host}
        />
      </div>
    </div>
  );
}
