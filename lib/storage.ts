import { createHash } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

// Armazenamento de documentos. Em produção usa Vercel Blob se
// BLOB_READ_WRITE_TOKEN estiver definido, ou Azure Blob Storage se
// AZURE_STORAGE_CONNECTION_STRING estiver definido; senão, disco local (dev).
// UPLOADS_DIR (opcional) aponta o disco local para fora do checkout — sem
// isso, cada worktree de feature tem seu próprio uploads/, e apagar o
// worktree ao final da fase apaga os arquivos, órfãos do registro no banco
// (compartilhado entre worktrees via mesmo Postgres). Sem a variável, cai no
// comportamento de sempre (uploads/ dentro do cwd).
const RAIZ = process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), "uploads");
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER ?? "documentos";
const usarVercelBlob = (process.env.BLOB_READ_WRITE_TOKEN ?? "").length > 0;
const usarBlob = !usarVercelBlob && CONN.length > 0;

export type ArquivoSalvo = {
  hash: string;
  tamanho: number;
  caminhoRelativo: string;
};

// Import dinâmico do SDK só quando Blob está ativo (não pesa em dev).
async function containerClient() {
  const { BlobServiceClient } = await import("@azure/storage-blob");
  const svc = BlobServiceClient.fromConnectionString(CONN);
  const cc = svc.getContainerClient(CONTAINER);
  await cc.createIfNotExists();
  return cc;
}

export async function salvarArquivo(
  politicaId: string,
  nomeArquivo: string,
  bytes: Buffer,
): Promise<ArquivoSalvo> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const ext = path.extname(nomeArquivo);
  const fisico = `${hash}${ext}`;
  const caminhoRelativo = `${politicaId}/${fisico}`;

  if (usarVercelBlob) {
    const { put } = await import("@vercel/blob");
    // addRandomSuffix: false mantém caminhoRelativo como identificador
    // estável (é ele que fica salvo no banco, não a URL do blob).
    await put(caminhoRelativo, bytes, { access: "public", addRandomSuffix: false });
  } else if (usarBlob) {
    const cc = await containerClient();
    await cc.getBlockBlobClient(caminhoRelativo).uploadData(bytes);
  } else {
    const dir = path.join(RAIZ, politicaId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fisico), bytes);
  }

  return { hash, tamanho: bytes.length, caminhoRelativo };
}

export async function lerArquivo(caminhoRelativo: string): Promise<Buffer> {
  if (usarVercelBlob) {
    const { head } = await import("@vercel/blob");
    const blob = await head(caminhoRelativo);
    const resposta = await fetch(blob.url);
    return Buffer.from(await resposta.arrayBuffer());
  }
  if (usarBlob) {
    const cc = await containerClient();
    return cc.getBlockBlobClient(caminhoRelativo).downloadToBuffer();
  }
  // Caminho salvo com "/"; normaliza para o SO.
  return readFile(path.join(RAIZ, ...caminhoRelativo.split("/")));
}
