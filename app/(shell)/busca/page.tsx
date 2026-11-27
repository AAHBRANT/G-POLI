import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

// A antiga Busca foi incorporada ao Catálogo: mantém links e favoritos antigos funcionando.
export default async function BuscaPage(props: { searchParams: Promise<Params> }) {
  const searchParams = await props.searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string" && v) qs.set(k, v);
  }
  const s = qs.toString();
  redirect(s ? `/catalogo?${s}` : "/catalogo");
}
