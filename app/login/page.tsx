import Link from "next/link";
import { authEnabled } from "@/lib/auth/config";
import TeamsSso from "@/components/TeamsSso";
import Brand from "@/components/Brand";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { erro?: string };
}) {
  const erros: Record<string, string> = {
    sem_code: "Login não retornou o código de autorização.",
    falha_login: "Não foi possível concluir o login. Tente novamente.",
  };
  const erro = searchParams.erro ? erros[searchParams.erro] ?? "Erro no login." : null;

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-gradient-to-br from-marsala-900 via-marsala to-marsala-700 p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-bege/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-black/20 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white p-8 shadow-premium">
        <div className="mb-6 flex justify-center">
          <Brand size="lg" />
        </div>
        <p className="mb-6 text-center text-sm text-black/50">
          Gestão de Políticas e Normativos
        </p>

        {!authEnabled ? (
          <div className="rounded-lg bg-bege/40 p-4 text-sm text-black/70">
            Autenticação desativada (modo dev). Configure o Entra ID no <code>.env</code> para ativar.
            <Link href="/" className="mt-3 block font-medium text-marsala underline">
              Entrar sem login →
            </Link>
          </div>
        ) : (
          <>
            {erro && (
              <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
            )}
            <div className="mb-3 text-center">
              <TeamsSso />
            </div>
            <a
              href="/api/auth/login"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-marsala px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition hover:bg-marsala-600"
            >
              <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden><path fill="#fff" d="M1 1h10v10H1z" opacity=".9"/><path fill="#fff" d="M12 1h10v10H12z" opacity=".65"/><path fill="#fff" d="M1 12h10v10H1z" opacity=".65"/><path fill="#fff" d="M12 12h10v10H12z" opacity=".4"/></svg>
              Entrar com Microsoft
            </a>
            <p className="mt-4 text-center text-xs text-black/40">
              Acesso restrito — somente contas liberadas pelo administrador.
            </p>
          </>
        )}
      </div>

      <p className="relative mt-6 text-center text-xs text-white/40">
        © AAHBRANT Engenharia &amp; Construções
      </p>
    </div>
  );
}
