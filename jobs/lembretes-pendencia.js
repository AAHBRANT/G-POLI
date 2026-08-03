// jobs/lembretes-pendencia.js
//
// Dispara a rota protegida /api/cron/lembretes-pendencia. JS puro (não TS):
// o output standalone do Next não inclui scripts TypeScript soltos nem o
// compilador — só o runtime Node e o que o build do Next rastreia. Este
// arquivo é copiado explicitamente no Dockerfile (ver COPY jobs ./jobs) pra
// existir na imagem de runtime.
const baseUrl = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET ?? "";

if (!baseUrl || !secret) {
  console.error("APP_BASE_URL ou CRON_SECRET ausente — abortando.");
  process.exit(1);
}

fetch(`${baseUrl}/api/cron/lembretes-pendencia`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
})
  .then(async (resp) => {
    const corpo = await resp.text();
    console.log(`status=${resp.status} corpo=${corpo}`);
    if (!resp.ok) process.exit(1);
  })
  .catch((erro) => {
    console.error("Falha na chamada:", erro);
    process.exit(1);
  });
