import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const SKIP_MUST_CHANGE_PASSWORD_KEY = 'skipMustChangePassword';
export const SkipMustChangePassword = () => SetMetadata(SKIP_MUST_CHANGE_PASSWORD_KEY, true);

export interface LinkedRoleRef {
  id: string;
  nome: string;
  isPrimary: boolean;
}

export interface LinkedOrgRef {
  id: string;
  nome: string;
  sigla: string | null;
  isPrimary: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  activeRoleId: string;
  activeOrgaoId: string | null;
  activeOrgaoAll: boolean;
  permissions: string[];
  type: 'access' | 'refresh';
  sessionVersion: number;
  mustChangePassword: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  nome: string;
  role: string;
  activeRoleId: string;
  activeOrgaoId: string | null;
  activeOrgaoAll: boolean;
  activeOrgaoNome: string | null;
  permissions: string[];
  mustChangePassword: boolean;
  linkedRoles: LinkedRoleRef[];
  linkedOrgs: LinkedOrgRef[];
  canAccessAllOrgs: boolean;
}
