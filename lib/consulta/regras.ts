import { createHash } from "crypto";
import { tipoDocumento } from "@/lib/constants";
import type { UsuarioAtual } from "@/lib/auth/rbac";
import type { TrechoEncontrado } from "@/lib/politica/indiceServidor";

// Regras PURAS do agente de Consulta (sem rede e sem banco): validação da
// pergunta, identificação da sessão por usuário, formato do resultado da busca
// que o agente lê, fontes para a tela e limite de uso.

export const TAMANHO_MAXIMO_MENSAGEM = 1000;
export const TAMANHO_MAXIMO_CONSULTA_FERRAMENTA = 200;
export const MAXIMO_BUSCAS_POR_PERGUNTA = 4;

export function validarMensagem(texto: unknown): { ok: true; texto: string } | { ok: false; erro: string } {
  if (typeof texto !== "string") return { ok: false, erro: "Escreva sua pergunta." };
  const t = texto.trim();
  if (t.length === 0) return { ok: false, erro: "Escreva sua pergunta." };
  if (t.length > TAMANHO_MAXIMO_MENSAGEM) {
    return { ok: false, erro: `Pergunta muito longa (máximo ${TAMANHO_MAXIMO_MENSAGEM} caracteres).` };
  }
  return { ok: true, texto: t };
}

/** Identificador estável e anônimo do dono da sessão (vai nos metadados da sessão na Anthropic). */
export function chaveUsuario(u: Pick<UsuarioAtual, "oid" | "email">): string {
  return createHash("sha256").update((u.oid || u.email).toLowerCase()).digest("hex").slice(0, 32);
}

export type Fonte = {
  politicaId: string;
  codigo: string | null;
  titulo: string;
  tipoRotulo: string;
  revisao: number;
  secao: string;
};

export function fontesDe(trechos: TrechoEncontrado[]): Fonte[] {
  const vistos = new Set<string>();
  const fontes: Fonte[] = [];
  for (const t of trechos) {
    const chave = `${t.politicaId}|${t.secaoCodigo}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    fontes.push({
      politicaId: t.politicaId,
      codigo: t.codigo,
      titulo: t.titulo,
      tipoRotulo: tipoDocumento(t.tipo).rotulo,
      revisao: t.revisao,
      secao: `${t.secaoCodigo}. ${t.secaoTitulo}`,
    });
  }
  return fontes;
}

/** Texto que o agente lê como resultado da ferramenta buscar_documentos. */
export function formatarResultadoBusca(trechos: TrechoEncontrado[]): string {
  if (trechos.length === 0) {
    return "nenhum documento encontrado para essa consulta entre os documentos vigentes a que esta pessoa tem acesso.";
  }
  return trechos
    .map(
      (t, i) =>
        `[${i + 1}] ${t.codigo ?? "sem código"} — ${t.titulo} (${tipoDocumento(t.tipo).rotulo}, Rev. ${t.revisao}, área ${t.area}; seção ${t.secaoCodigo}. ${t.secaoTitulo})\n${t.texto}`,
    )
    .join("\n\n---\n\n");
}

/** Limite de uso por pessoa (janela deslizante, em memória). */
export function criarLimitador(max: number, janelaMs: number) {
  const usos = new Map<string, number[]>();
  return {
    permitir(chave: string, agora: number = Date.now()): boolean {
      const recentes = (usos.get(chave) ?? []).filter((t) => agora - t < janelaMs);
      if (recentes.length >= max) {
        usos.set(chave, recentes);
        return false;
      }
      recentes.push(agora);
      usos.set(chave, recentes);
      return true;
    },
  };
}
