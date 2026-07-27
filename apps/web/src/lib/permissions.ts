import type { LucideIcon } from 'lucide-react';
import { FileText, GitMerge, Settings, Upload } from 'lucide-react';

export type AdminPermission =
  | 'acts:read'
  | 'acts:write'
  | 'acts:publish'
  | 'acts:version'
  | 'acts:history'
  | 'acts:consolidate'
  | 'imports:manage'
  | 'ocr:review'
  | 'users:manage'
  | 'audit:read'
  | 'orgs:all';

export const ADMIN_NAV: {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  permission: AdminPermission;
}[] = [
  { href: '/admin/atos', label: 'Atos', short: 'Atos', icon: FileText, permission: 'acts:read' },
  { href: '/admin/importar', label: 'Importar', short: 'Import', icon: Upload, permission: 'imports:manage' },
  { href: '/admin/consolidar', label: 'Consolidar', short: 'Consol.', icon: GitMerge, permission: 'acts:consolidate' },
  { href: '/admin/administracao', label: 'Administração', short: 'Admin', icon: Settings, permission: 'users:manage' },
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

/** Permissão mínima exigida pela rota admin atual (para aviso ao trocar contexto). */
export function routeRequiredPermission(pathname: string): AdminPermission | null {
  if (pathname.startsWith('/admin/importar')) return 'imports:manage';
  if (pathname.startsWith('/admin/consolidar')) return 'acts:consolidate';
  if (pathname.startsWith('/admin/administracao')) return 'users:manage';
  if (pathname.match(/\/admin\/atos\/[^/]+/)) return 'acts:write';
  if (pathname.startsWith('/admin/atos')) return 'acts:read';
  return null;
}
