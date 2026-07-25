import { createHash } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

// Armazenamento de documentos. Em produção (Azure) usa Blob Storage se
// AZURE_STORAGE_CONNECTION_STRING estiver definido; senão, disco local (dev).
const RAIZ = path.join(process.cwd(), "uploads");
const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER ?? "documentos";
const usarBlob = CONN.length > 0;

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

  if (usarBlob) {
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
  if (usarBlob) {
    const cc = await containerClient();
    return cc.getBlockBlobClient(caminhoRelativo).downloadToBuffer();
  }
  // Caminho salvo com "/"; normaliza para o SO.
  return readFile(path.join(RAIZ, ...caminhoRelativo.split("/")));
}
