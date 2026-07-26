import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ATTACHMENTS_DIR, UPLOADS_ROOT, resolveUploadPath } from './uploads';

export function safeStoredFilename(originalName: string): string {
  return originalName.replace(/[^\w.\-() ]/g, '_') || 'arquivo';
}

/** Copia um arquivo para o armazenamento definitivo de anexos. */
export async function copyToPermanentAttachmentStorage(
  sourceAbsolutePath: string,
  actId: string,
  originalName: string,
): Promise<{ url: string; nome: string; tamanho: number; hash: string }> {
  await fs.access(sourceAbsolutePath);
  const buf = await fs.readFile(sourceAbsolutePath);
  await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
  const storedName = `${actId}-${Date.now()}-${safeStoredFilename(originalName)}`;
  const dest = path.join(ATTACHMENTS_DIR, storedName);
  await fs.writeFile(dest, buf);
  return {
    url: `attachments/${storedName}`,
    nome: originalName,
    tamanho: buf.length,
    hash: crypto.createHash('sha256').update(buf).digest('hex'),
  };
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve o caminho absoluto a partir da referência persistida.
 * Referências legadas `/api/admin/imports/:id/file` exigem o nome real do arquivo
 * (Import.arquivo), passado via `importStoredFilename`.
 */
export function resolveAttachmentAbsolutePath(
  storedUrl: string,
  importStoredFilename?: string | null,
): string {
  if (storedUrl.includes('/api/admin/imports/')) {
    if (importStoredFilename) {
      return path.join(UPLOADS_ROOT, importStoredFilename);
    }
    // Fallback incorreto antigo — evita usar o UUID da importação como nome de arquivo.
    return path.join(UPLOADS_ROOT, '__missing_import_file__');
  }
  if (!storedUrl.includes('/') && !storedUrl.startsWith('attachments')) {
    // Nome relativo na raiz de uploads (arquivo de importação).
    return path.join(UPLOADS_ROOT, storedUrl);
  }
  return resolveUploadPath(storedUrl);
}

export function isTemporaryOrLegacyAttachmentUrl(url: string): boolean {
  if (!url) return true;
  if (url.includes('/api/admin/imports/')) return true;
  if (url.startsWith('blob:')) return true;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // URLs externas absolutas não são o armazenamento definitivo local.
    return !url.includes('/public/attachments/');
  }
  return false;
}
