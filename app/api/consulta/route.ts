import { NextResponse } from "next/server";
import { getUsuarioAtual } from "@/lib/auth/usuario";
import { conversar, consultaDisponivel } from "@/lib/consulta/agente";
import { chaveUsuario, criarLimitador, validarMensagem } from "@/lib/consulta/regras";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 20 perguntas por pessoa a cada 10 minutos (em memória; protege custo e abuso).
const limitador = criarLimitador(20, 10 * 60 * 1000);

// Pergunta ao agente de Consulta. Responde em NDJSON (um evento JSON por linha):
// sessao, status, mensagem, fontes, fim ou erro. Exige login (o middleware já
// bloqueia sem sessão; aqui conferimos de novo) e só aceita pedidos feitos pelo
// próprio site (Origin), porque o cookie de sessão vale também dentro do Teams.
export async function POST(req: Request) {
  const usuario = await getUsuarioAtual();
  if (!usuario) return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });
  if (!consultaDisponivel()) {
    return NextResponse.json({ erro: "A consulta por IA ainda não está disponível." }, { status: 503 });
  }

  const origem = req.headers.get("origin");
  if (origem) {
    const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")].filter(Boolean) as string[];
    let hostOrigem = "";
    try {
      hostOrigem = new URL(origem).host;
    } catch {
      /* origem inválida */
    }
    if (!hostOrigem || !hosts.includes(hostOrigem)) {
      return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
    }
  }

  const corpo = (await req.json().catch(() => null)) as { mensagem?: unknown; sessaoId?: unknown } | null;
  const v = validarMensagem(corpo?.mensagem);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  if (!limitador.permitir(chaveUsuario(usuario))) {
    return NextResponse.json({ erro: "Muitas perguntas em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const sessaoId = typeof corpo?.sessaoId === "string" && corpo.sessaoId.length <= 128 ? corpo.sessaoId : null;
  const codificador = new TextEncoder();

  const fluxo = new ReadableStream({
    async start(controle) {
      try {
        for await (const ev of conversar({ usuario, mensagem: v.texto, sessaoId })) {
          controle.enqueue(codificador.encode(JSON.stringify(ev) + "\n"));
        }
      } finally {
        controle.close();
      }
    },
  });

  return new Response(fluxo, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
