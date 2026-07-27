import type { Prisma } from '@prisma/client';

export const ORGS_ALL_PERMISSION = 'orgs:all';

export const userContextInclude = {
  role: {
    include: {
      permissions: { include: { permission: true } },
    },
  },
  roleLinks: {
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  },
  orgLinks: {
    include: {
      orgao: { select: { id: true, nome: true, sigla: true, ativo: true } },
    },
  },
  extraPermissions: { include: { permission: true } },
} satisfies Prisma.UserInclude;

/** @deprecated use userContextInclude */
export const USER_CONTEXT_INCLUDE = userContextInclude;
/** @deprecated use userContextInclude */
export const USER_PERMISSIONS_INCLUDE = userContextInclude;

export type UserWithContext = Prisma.UserGetPayload<{ include: typeof userContextInclude }>;

type RolePermissionCarrier = {
  id?: string;
  permissions: { permission: { chave: string } }[];
};

type UserContextCarrier = {
  roleId: string;
  role: RolePermissionCarrier & { id: string; nome: string };
  roleLinks: { roleId: string; isPrimary: boolean; role: RolePermissionCarrier & { id: string; nome: string } }[];
  orgLinks?: {
    orgaoId: string;
    isPrimary: boolean;
    orgao: { id: string; nome: string; sigla: string | null; ativo: boolean };
  }[];
  extraPermissions: { permission: { chave: string } }[];
};

export function resolvePrimaryRoleId(user: {
  roleId: string;
  roleLinks: { roleId: string; isPrimary: boolean }[];
}): string {
  const primary = user.roleLinks.find((l) => l.isPrimary);
  if (primary) return primary.roleId;
  if (user.roleLinks.length) return user.roleLinks[0].roleId;
  return user.roleId;
}

export function resolvePrimaryOrgaoId(user: {
  orgLinks?: { orgaoId: string; isPrimary: boolean }[];
}): string | null {
  const links = user.orgLinks ?? [];
  const primary = links.find((l) => l.isPrimary);
  if (primary) return primary.orgaoId;
  if (links.length) return links[0].orgaoId;
  return null;
}

export function resolveActiveRoleLink(user: UserContextCarrier, activeRoleId?: string) {
  const roleId = activeRoleId ?? resolvePrimaryRoleId(user);
  const link = user.roleLinks.find((l) => l.roleId === roleId);
  if (link) return link;
  if (roleId === user.role.id) {
    return {
      roleId: user.role.id,
      isPrimary: true,
      role: user.role,
    };
  }
  return user.roleLinks[0] ?? null;
}

export function resolveEffectivePermissions(
  user: UserContextCarrier,
  activeRoleId?: string,
): string[] {
  const link = resolveActiveRoleLink(user, activeRoleId);
  const keys = new Set<string>();
  if (link) {
    for (const rp of link.role.permissions) {
      keys.add(rp.permission.chave);
    }
  }
  for (const up of user.extraPermissions) {
    keys.add(up.permission.chave);
  }
  return [...keys].sort();
}

export function userCanAccessAllOrgs(permissions: string[]): boolean {
  return permissions.includes(ORGS_ALL_PERMISSION);
}

export function resolveLinkedRoles(user: UserContextCarrier) {
  if (user.roleLinks.length) {
    return user.roleLinks
      .slice()
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.role.nome.localeCompare(b.role.nome);
      })
      .map((l) => ({
        id: l.role.id,
        nome: l.role.nome,
        isPrimary: l.isPrimary,
      }));
  }
  return [{ id: user.role.id, nome: user.role.nome, isPrimary: true }];
}

export function resolveLinkedOrgs(user: UserContextCarrier) {
  return (user.orgLinks ?? [])
    .slice()
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.orgao.nome.localeCompare(b.orgao.nome);
    })
    .map((l) => ({
      id: l.orgao.id,
      nome: l.orgao.nome,
      sigla: l.orgao.sigla,
      isPrimary: l.isPrimary,
    }));
}
