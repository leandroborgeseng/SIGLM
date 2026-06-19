import * as path from 'path';

export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
export const ATTACHMENTS_DIR = path.join(UPLOADS_ROOT, 'attachments');

export function resolveUploadPath(storedUrl: string): string {
  if (storedUrl.startsWith('attachments/')) {
    return path.join(UPLOADS_ROOT, storedUrl);
  }
  if (storedUrl.startsWith('/uploads/')) {
    return path.join(UPLOADS_ROOT, storedUrl.replace(/^\/uploads\//, ''));
  }
  if (storedUrl.startsWith('/api/admin/imports/')) {
    const importId = storedUrl.split('/')[4];
    return path.join(UPLOADS_ROOT, importId);
  }
  const basename = path.basename(storedUrl);
  return path.join(UPLOADS_ROOT, basename);
}
