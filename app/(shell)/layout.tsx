import { redirect } from "next/navigation";
import Sidebar from "@/components/shell/Sidebar";
import Header from "@/components/shell/Header";
import ToastPendencias from "@/components/shell/ToastPendencias";
import { authEnabled } from "@/lib/auth/config";
import { getUsuarioAtual } from "@/lib/auth/usuario";

export default async function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Com auth ligada, sessão sem usuário ativo (removido/desativado) perde acesso.
  if (authEnabled) {
    const u = await getUsuarioAtual();
    if (!u) redirect("/sem-acesso");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
      <ToastPendencias />
    </div>
  );
}
