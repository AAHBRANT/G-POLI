import { NextResponse } from "next/server";

// Endpoint de saúde para as probes do Container App (startup/liveness/readiness).
// Ver docs/DEPLOY.md. Leve e SEM dependência de banco de propósito: numa réplica
// única, um blip do Postgres não deve tirar todo o tráfego do ar. A garantia de
// schema vem do startup fail-closed (docker-entrypoint): as migrações rodam ANTES
// de o server subir, então "este handler responde" já implica "schema migrado".
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
