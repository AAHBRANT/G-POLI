export const dynamic = "force-dynamic";

export default function SemAcesso() {
  return (
    <main className="grid min-h-screen place-items-center bg-bege/30 p-6">
      <div className="w-full max-w-md rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-marsala/10 text-2xl">
          🔒
        </div>
        <h1 className="text-lg font-semibold text-marsala">Acesso restrito</h1>
        <p className="mt-2 text-sm text-black/60">
          Seu e-mail ainda não foi liberado para o G-Políticas. O acesso é concedido
          individualmente pelo administrador.
        </p>
        <p className="mt-4 text-xs text-black/40">
          Solicite a liberação informando seu e-mail corporativo ao administrador do sistema.
        </p>
        <a
          href="/api/auth/logout"
          className="mt-6 inline-block rounded-md border border-black/15 px-4 py-2 text-xs text-black/70 transition hover:bg-black/5"
        >
          Sair
        </a>
      </div>
    </main>
  );
}
