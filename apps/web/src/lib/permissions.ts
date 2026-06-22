import type { LucideIcon } from 'lucide-react';
import { FileText, GitMerge, ScanText, Upload } from 'lucide-react';

export type AdminPermission =
  | 'acts:read'
  | 'acts:write'
  | 'acts:publish'
  | 'acts:consolidate'
  | 'imports:manage'
  | 'ocr:review'
  | 'users:manage'
  | 'audit:read';

export const ADMIN_NAV: {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  permission: AdminPermission;
}[] = [
  { href: '/admin/atos', label: 'Atos', short: 'Atos', icon: FileText, permission: 'acts:read' },
  { href: '/admin/importar', label: 'Importar', short: 'Import', icon: Upload, permission: 'imports:manage' },
  { href: '/admin/ocr', label: 'OCR', short: 'OCR', icon: ScanText, permission: 'ocr:review' },
  { href: '/admin/consolidar', label: 'Consolidar', short: 'Consol.', icon: GitMerge, permission: 'acts:consolidate' },
];

export function hasPermission(
  permissions: string[] | undefined,
  required: AdminPermission,
): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(required);
}

export function filterNavByPermissions(permissions: string[] | undefined) {
  return ADMIN_NAV.filter((item) => hasPermission(permissions, item.permission));
}
