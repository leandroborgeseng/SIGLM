import * as path from 'path';

export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
export const ATTACHMENTS_DIR = path.join(UPLOADS_ROOT, 'attachments');

/**
 * Resolve caminho local a partir da referência persistida no Attachment.url.
 * Preferir sempre `attachments/{id-arquivo}` (armazenamento definitivo).
 * Referências legadas de importação devem ser resolvidas via Import.arquivo
 * (ver attachment-storage.ts) — não usar o UUID da importação como nome de ficheiro.
 */
export function resolveUploadPath(storedUrl: string): string {
  if (storedUrl.startsWith('attachments/')) {
    return path.join(UPLOADS_ROOT, storedUrl);
  }
  if (storedUrl.startsWith('/uploads/')) {
    return path.join(UPLOADS_ROOT, storedUrl.replace(/^\/uploads\//, ''));
  }
  if (storedUrl.startsWith('/api/admin/imports/')) {
    // Sem o nome real do arquivo da importação não é possível localizar o ficheiro.
    // Callers devem usar resolveAttachmentAbsolutePath com Import.arquivo.
    return path.join(UPLOADS_ROOT, '__legacy_import_url_unresolved__');
  }
  // Import.arquivo e outros nomes relativos na raiz de uploads.
  const basename = path.basename(storedUrl);
  return path.join(UPLOADS_ROOT, basename);
}
