import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { assertPasswordPolicy } from '../auth/password-policy';
import {
  resolveEffectivePermissions,
  resolvePrimaryRoleId,
} from '../auth/effective-permissions';

@Injectable()
export class AdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── Órgãos de origem ──────────────────────────────────────────────────────

  listOrgans(includeInactive = true) {
    return this.prisma.originOrg.findMany({
      where: includeInactive ? undefined : { ativo: true },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { acts: true } } },
    });
  }

  async createOrgan(nome: string, sigla?: string | null) {
    const trimmed = nome.trim();
    if (trimmed.length < 2) throw new BadRequestException('Nome do órgão inválido');
    const existing = await this.prisma.originOrg.findFirst({
      where: { nome: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Já existe um órgão com este nome');
    const siglaTrimmed = sigla?.trim() || null;
    return this.prisma.originOrg.create({
      data: { nome: trimmed, sigla: siglaTrimmed, ativo: true },
    });
  }

  async updateOrgan(id: string, data: { nome?: string; sigla?: string | null; ativo?: boolean }) {
    const org = await this.prisma.originOrg.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Órgão não encontrado');

    if (data.nome !== undefined) {
      const trimmed = data.nome.trim();
      if (trimmed.length < 2) throw new BadRequestException('Nome do órgão inválido');
      const clash = await this.prisma.originOrg.findFirst({
        where: {
          nome: { equals: trimmed, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (clash) throw new ConflictException('Já existe um órgão com este nome');
      data.nome = trimmed;
    }

    const updated = await this.prisma.originOrg.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.sigla !== undefined && { sigla: data.sigla?.trim() || null }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });

    if (data.nome) {
      await this.refreshActsOrgaoDenormForOrgan(id);
    }

    return updated;
  }

  private async refreshActsOrgaoDenormForOrgan(orgaoId: string) {
    const links = await this.prisma.actOriginOrg.findMany({
      where: { orgaoId },
      select: { actId: true },
      distinct: ['actId'],
    });
    for (const { actId } of links) {
      const orgs = await this.prisma.actOriginOrg.findMany({
        where: { actId },
        orderBy: { ordem: 'asc' },
        include: { orgao: true },
      });
      const primary = orgs[0];
      await this.prisma.normativeAct.update({
        where: { id: actId },
        data: {
          orgaoOrigem: orgs.map((o) => o.orgao.nome).join('; ') || null,
          orgaoOrigemId: primary?.orgaoId ?? null,
        },
      });
    }
    // Atos legados só com FK direta
    const legacy = await this.prisma.normativeAct.findMany({
      where: { orgaoOrigemId: orgaoId, originOrgs: { none: {} } },
      select: { id: true },
    });
    if (legacy.length) {
      const org = await this.prisma.originOrg.findUnique({ where: { id: orgaoId } });
      if (org) {
        await this.prisma.normativeAct.updateMany({
          where: { id: { in: legacy.map((a) => a.id) } },
          data: { orgaoOrigem: org.nome },
        });
      }
    }
  }

  // ─── Meios de publicação ───────────────────────────────────────────────────

  listPublicationMedia(includeInactive = true) {
    return this.prisma.publicationMedium.findMany({
      where: includeInactive ? undefined : { ativo: true },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { acts: true } } },
    });
  }

  async createPublicationMedium(nome: string) {
    const trimmed = nome.trim();
    if (trimmed.length < 2) throw new BadRequestException('Nome do meio de publicação inválido');
    const existing = await this.prisma.publicationMedium.findFirst({
      where: { nome: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Já existe um meio de publicação com este nome');
    return this.prisma.publicationMedium.create({ data: { nome: trimmed, ativo: true } });
  }

  async updatePublicationMedium(id: string, data: { nome?: string; ativo?: boolean }) {
    const medium = await this.prisma.publicationMedium.findUnique({ where: { id } });
    if (!medium) throw new NotFoundException('Meio de publicação não encontrado');

    if (data.nome !== undefined) {
      const trimmed = data.nome.trim();
      if (trimmed.length < 2) throw new BadRequestException('Nome do meio de publicação inválido');
      const clash = await this.prisma.publicationMedium.findFirst({
        where: {
          nome: { equals: trimmed, mode: 'insensitive' },
          NOT: { id },
        },
      });
      if (clash) throw new ConflictException('Já existe um meio de publicação com este nome');
      data.nome = trimmed;
    }

    return this.prisma.publicationMedium.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });
  }

  // ─── Signatários ───────────────────────────────────────────────────────────

  listSignatories(includeInactive = true) {
    return this.prisma.signatory.findMany({
      where: includeInactive ? undefined : { ativo: true },
      orderBy: [{ nome: 'asc' }, { cargo: 'asc' }],
      include: {
        orgao: { select: { id: true, nome: true, sigla: true } },
        _count: { select: { links: true } },
      },
    });
  }

  async createSignatory(data: { nome: string; cargo: string; orgaoId?: string | null }) {
    const nome = data.nome?.trim();
    const cargo = data.cargo?.trim();
    if (!nome || nome.length < 2) throw new BadRequestException('Nome do signatário inválido');
    if (!cargo || cargo.length < 2) throw new BadRequestException('Cargo do signatário inválido');

    let orgaoId: string | null = null;
    if (data.orgaoId) {
      const org = await this.prisma.originOrg.findUnique({ where: { id: data.orgaoId } });
      if (!org) throw new BadRequestException('Órgão inválido');
      orgaoId = org.id;
    }

    return this.prisma.signatory.create({
      data: { nome, cargo, orgaoId, ativo: true },
      include: { orgao: { select: { id: true, nome: true, sigla: true } } },
    });
  }

  async updateSignatory(
    id: string,
    data: { nome?: string; cargo?: string; orgaoId?: string | null; ativo?: boolean },
  ) {
    const existing = await this.prisma.signatory.findUnique({
      where: { id },
      include: { _count: { select: { links: true } } },
    });
    if (!existing) throw new NotFoundException('Signatário não encontrado');

    if (data.nome !== undefined) {
      const nome = data.nome.trim();
      if (nome.length < 2) throw new BadRequestException('Nome do signatário inválido');
      data.nome = nome;
    }
    if (data.cargo !== undefined) {
      const cargo = data.cargo.trim();
      if (cargo.length < 2) throw new BadRequestException('Cargo do signatário inválido');
      data.cargo = cargo;
    }

    let orgaoId: string | null | undefined = undefined;
    if (data.orgaoId !== undefined) {
      if (data.orgaoId) {
        const org = await this.prisma.originOrg.findUnique({ where: { id: data.orgaoId } });
        if (!org) throw new BadRequestException('Órgão inválido');
        orgaoId = org.id;
      } else {
        orgaoId = null;
      }
    }

    return this.prisma.signatory.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.cargo !== undefined && { cargo: data.cargo }),
        ...(orgaoId !== undefined && { orgaoId }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
      include: { orgao: { select: { id: true, nome: true, sigla: true } } },
    });
  }

  // ─── Usuários ──────────────────────────────────────────────────────────────

  listUsers() {
    return this.prisma.user.findMany({
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        mustChangePassword: true,
        createdAt: true,
        role: { select: { id: true, nome: true, descricao: true } },
        roleLinks: {
          include: { role: { select: { id: true, nome: true, descricao: true } } },
          orderBy: [{ isPrimary: 'desc' }, { role: { nome: 'asc' } }],
        },
        orgLinks: {
          include: { orgao: { select: { id: true, nome: true, sigla: true } } },
          orderBy: [{ isPrimary: 'desc' }, { orgao: { nome: 'asc' } }],
        },
      },
    }).then((users) =>
      users.map((u) => {
        const primaryRoleLink = u.roleLinks.find((l) => l.isPrimary) ?? u.roleLinks[0];
        const primaryOrgLink = u.orgLinks.find((l) => l.isPrimary) ?? u.orgLinks[0];
        return {
          id: u.id,
          nome: u.nome,
          email: u.email,
          ativo: u.ativo,
          mustChangePassword: u.mustChangePassword,
          createdAt: u.createdAt,
          role: primaryRoleLink?.role ?? u.role,
          rolesCount: u.roleLinks.length || 1,
          primaryOrg: primaryOrgLink?.orgao ?? null,
          orgsCount: u.orgLinks.length,
          roleLinks: u.roleLinks.map((l) => ({
            roleId: l.roleId,
            isPrimary: l.isPrimary,
            role: l.role,
          })),
          orgLinks: u.orgLinks.map((l) => ({
            orgaoId: l.orgaoId,
            isPrimary: l.isPrimary,
            orgao: l.orgao,
          })),
        };
      }),
    );
  }

  async createUser(
    data: {
      nome: string;
      email: string;
      senha: string;
      roleIds: string[];
      primaryRoleId?: string;
      orgaoIds?: string[];
      primaryOrgaoId?: string;
      mustChangePassword?: boolean;
    },
    actorId?: string,
    ip?: string,
  ) {
    const email = data.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const roleIds = [...new Set(data.roleIds)];
    if (!roleIds.length) throw new BadRequestException('Informe ao menos um perfil');

    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) throw new BadRequestException('Perfil inválido');

    const primaryRoleId = data.primaryRoleId && roleIds.includes(data.primaryRoleId)
      ? data.primaryRoleId
      : roleIds.length === 1
        ? roleIds[0]
        : roleIds[0];

    const orgaoIds = [...new Set(data.orgaoIds ?? [])];
    if (orgaoIds.length) {
      const orgs = await this.prisma.originOrg.findMany({ where: { id: { in: orgaoIds } } });
      if (orgs.length !== orgaoIds.length) throw new BadRequestException('Órgão inválido');
    }
    const primaryOrgaoId =
      data.primaryOrgaoId && orgaoIds.includes(data.primaryOrgaoId)
        ? data.primaryOrgaoId
        : orgaoIds.length === 1
          ? orgaoIds[0]
          : orgaoIds.find((id) => id === data.primaryOrgaoId) ?? null;

    assertPasswordPolicy(data.senha);

    const hashSenha = await bcrypt.hash(data.senha, 10);
    const mustChangePassword = data.mustChangePassword ?? true;

    const user = await this.prisma.user.create({
      data: {
        nome: data.nome.trim(),
        email,
        hashSenha,
        roleId: primaryRoleId,
        ativo: true,
        mustChangePassword,
        roleLinks: {
          create: roleIds.map((roleId) => ({
            roleId,
            isPrimary: roleId === primaryRoleId,
          })),
        },
        ...(orgaoIds.length && {
          orgLinks: {
            create: orgaoIds.map((orgaoId) => ({
              orgaoId,
              isPrimary: orgaoId === primaryOrgaoId,
            })),
          },
        }),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        mustChangePassword: true,
        role: { select: { id: true, nome: true, descricao: true } },
        roleLinks: {
          include: { role: { select: { id: true, nome: true, descricao: true } } },
        },
        orgLinks: {
          include: { orgao: { select: { id: true, nome: true, sigla: true } } },
        },
      },
    });

    await this.audit.log({
      userId: actorId,
      acao: 'user.created',
      entidade: 'user',
      entidadeId: user.id,
      ip,
      diff: {
        mustChangePassword,
        roleIds,
        primaryRoleId,
        orgaoIds,
        primaryOrgaoId,
      },
    });

    await this.audit.log({
      userId: actorId,
      acao: 'user.password_created',
      entidade: 'user',
      entidadeId: user.id,
      ip,
      diff: { mustChangePassword },
    });

    return this.formatUserDetail(user);
  }

  async updateUser(
    id: string,
    data: {
      nome?: string;
      email?: string;
      senha?: string;
      roleIds?: string[];
      primaryRoleId?: string;
      orgaoIds?: string[];
      primaryOrgaoId?: string | null;
      ativo?: boolean;
      mustChangePassword?: boolean;
    },
    actorId?: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roleLinks: true,
        orgLinks: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (data.email) {
      const email = data.email.toLowerCase().trim();
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (clash) throw new ConflictException('E-mail já cadastrado');
      data.email = email;
    }

    let hashSenha: string | undefined;
    let passwordReset = false;
    if (data.senha && data.senha.length > 0) {
      assertPasswordPolicy(data.senha);
      hashSenha = await bcrypt.hash(data.senha, 10);
      passwordReset = true;
    }

    const willBeActive = data.ativo !== undefined ? data.ativo : user.ativo;

    if (data.roleIds !== undefined) {
      const roleIds = [...new Set(data.roleIds)];
      if (willBeActive && !roleIds.length) {
        throw new BadRequestException('Usuário ativo deve ter ao menos um perfil');
      }
      const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
      if (roles.length !== roleIds.length) throw new BadRequestException('Perfil inválido');

      const beforePrimary = user.roleLinks.find((l) => l.isPrimary)?.roleId ?? user.roleId;
      const primaryRoleId =
        data.primaryRoleId && roleIds.includes(data.primaryRoleId)
          ? data.primaryRoleId
          : roleIds.includes(beforePrimary)
            ? beforePrimary
            : roleIds.length === 1
              ? roleIds[0]
              : roleIds[0];

      await this.prisma.$transaction([
        this.prisma.userRole.deleteMany({ where: { userId: id } }),
        ...(roleIds.length
          ? [
              this.prisma.userRole.createMany({
                data: roleIds.map((roleId) => ({
                  userId: id,
                  roleId,
                  isPrimary: roleId === primaryRoleId,
                })),
              }),
            ]
          : []),
        this.prisma.user.update({
          where: { id },
          data: { roleId: primaryRoleId },
        }),
      ]);

      if (beforePrimary !== primaryRoleId) {
        await this.audit.log({
          userId: actorId,
          acao: 'user.primary_role_changed',
          entidade: 'user',
          entidadeId: id,
          ip,
          diff: { before: beforePrimary, after: primaryRoleId },
        });
      }

      await this.audit.log({
        userId: actorId,
        acao: 'user.roles_updated',
        entidade: 'user',
        entidadeId: id,
        ip,
        diff: { roleIds, primaryRoleId },
      });
    } else if (data.primaryRoleId) {
      const link = user.roleLinks.find((l) => l.roleId === data.primaryRoleId);
      if (!link) throw new BadRequestException('Perfil não vinculado ao usuário');
      const beforePrimary = user.roleLinks.find((l) => l.isPrimary)?.roleId ?? user.roleId;
      await this.prisma.$transaction([
        this.prisma.userRole.updateMany({
          where: { userId: id },
          data: { isPrimary: false },
        }),
        this.prisma.userRole.update({
          where: { userId_roleId: { userId: id, roleId: data.primaryRoleId } },
          data: { isPrimary: true },
        }),
        this.prisma.user.update({
          where: { id },
          data: { roleId: data.primaryRoleId },
        }),
      ]);
      if (beforePrimary !== data.primaryRoleId) {
        await this.audit.log({
          userId: actorId,
          acao: 'user.primary_role_changed',
          entidade: 'user',
          entidadeId: id,
          ip,
          diff: { before: beforePrimary, after: data.primaryRoleId },
        });
      }
    }

    if (data.orgaoIds !== undefined) {
      const orgaoIds = [...new Set(data.orgaoIds)];
      if (orgaoIds.length) {
        const orgs = await this.prisma.originOrg.findMany({ where: { id: { in: orgaoIds } } });
        if (orgs.length !== orgaoIds.length) throw new BadRequestException('Órgão inválido');
      }

      const beforePrimary = user.orgLinks.find((l) => l.isPrimary)?.orgaoId ?? null;
      const primaryOrgaoId =
        data.primaryOrgaoId && orgaoIds.includes(data.primaryOrgaoId)
          ? data.primaryOrgaoId
          : data.primaryOrgaoId === null
            ? null
            : beforePrimary && orgaoIds.includes(beforePrimary)
              ? beforePrimary
              : orgaoIds.length === 1
                ? orgaoIds[0]
                : null;

      await this.prisma.$transaction([
        this.prisma.userOriginOrg.deleteMany({ where: { userId: id } }),
        ...(orgaoIds.length
          ? [
              this.prisma.userOriginOrg.createMany({
                data: orgaoIds.map((orgaoId) => ({
                  userId: id,
                  orgaoId,
                  isPrimary: primaryOrgaoId !== null && orgaoId === primaryOrgaoId,
                })),
              }),
            ]
          : []),
      ]);

      if (beforePrimary !== primaryOrgaoId) {
        await this.audit.log({
          userId: actorId,
          acao: 'user.primary_org_changed',
          entidade: 'user',
          entidadeId: id,
          ip,
          diff: { before: beforePrimary, after: primaryOrgaoId },
        });
      }

      await this.audit.log({
        userId: actorId,
        acao: 'user.orgs_updated',
        entidade: 'user',
        entidadeId: id,
        ip,
        diff: { orgaoIds, primaryOrgaoId },
      });
    } else if (data.primaryOrgaoId !== undefined) {
      if (data.primaryOrgaoId) {
        const link = user.orgLinks.find((l) => l.orgaoId === data.primaryOrgaoId);
        if (!link) throw new BadRequestException('Órgão não vinculado ao usuário');
      }
      const beforePrimary = user.orgLinks.find((l) => l.isPrimary)?.orgaoId ?? null;
      await this.prisma.$transaction([
        this.prisma.userOriginOrg.updateMany({
          where: { userId: id },
          data: { isPrimary: false },
        }),
        ...(data.primaryOrgaoId
          ? [
              this.prisma.userOriginOrg.update({
                where: {
                  userId_orgaoId: { userId: id, orgaoId: data.primaryOrgaoId },
                },
                data: { isPrimary: true },
              }),
            ]
          : []),
      ]);
      if (beforePrimary !== data.primaryOrgaoId) {
        await this.audit.log({
          userId: actorId,
          acao: 'user.primary_org_changed',
          entidade: 'user',
          entidadeId: id,
          ip,
          diff: { before: beforePrimary, after: data.primaryOrgaoId },
        });
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome.trim() }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
        ...(data.mustChangePassword !== undefined && {
          mustChangePassword: data.mustChangePassword,
        }),
        ...(hashSenha && {
          hashSenha,
          sessionVersion: { increment: 1 },
        }),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        mustChangePassword: true,
        role: { select: { id: true, nome: true, descricao: true } },
        roleLinks: {
          include: { role: { select: { id: true, nome: true, descricao: true } } },
          orderBy: [{ isPrimary: 'desc' }, { role: { nome: 'asc' } }],
        },
        orgLinks: {
          include: { orgao: { select: { id: true, nome: true, sigla: true } } },
          orderBy: [{ isPrimary: 'desc' }, { orgao: { nome: 'asc' } }],
        },
      },
    });

    if (willBeActive) {
      const roleCount = updated.roleLinks.length;
      if (!roleCount) {
        throw new BadRequestException('Usuário ativo deve ter ao menos um perfil');
      }
    }

    if (passwordReset) {
      await this.audit.log({
        userId: actorId,
        acao: 'user.password_reset',
        entidade: 'user',
        entidadeId: id,
        ip,
        diff: {
          mustChangePassword: updated.mustChangePassword,
        },
      });
    }

    return this.formatUserDetail(updated);
  }

  private formatUserDetail(user: {
    id: string;
    nome: string;
    email: string;
    ativo: boolean;
    mustChangePassword: boolean;
    role: { id: string; nome: string; descricao: string | null };
    roleLinks: {
      roleId: string;
      isPrimary: boolean;
      role: { id: string; nome: string; descricao: string | null };
    }[];
    orgLinks: {
      orgaoId: string;
      isPrimary: boolean;
      orgao: { id: string; nome: string; sigla: string | null };
    }[];
  }) {
    const primaryRoleLink = user.roleLinks.find((l) => l.isPrimary) ?? user.roleLinks[0];
    const primaryOrgLink = user.orgLinks.find((l) => l.isPrimary) ?? user.orgLinks[0];
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      ativo: user.ativo,
      mustChangePassword: user.mustChangePassword,
      role: primaryRoleLink?.role ?? user.role,
      rolesCount: user.roleLinks.length || 1,
      primaryOrg: primaryOrgLink?.orgao ?? null,
      orgsCount: user.orgLinks.length,
      roleLinks: user.roleLinks.map((l) => ({
        roleId: l.roleId,
        isPrimary: l.isPrimary,
        role: l.role,
      })),
      orgLinks: user.orgLinks.map((l) => ({
        orgaoId: l.orgaoId,
        isPrimary: l.isPrimary,
        orgao: l.orgao,
      })),
    };
  }

  // ─── Perfis / permissões ───────────────────────────────────────────────────

  listRoles() {
    return this.prisma.role.findMany({
      orderBy: { nome: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { chave: 'asc' } });
  }

  async setRolePermissions(roleId: string, permissionIds: string[], actorId?: string, ip?: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundException('Perfil não encontrado');

    const before = role.permissions.map((p) => p.permission.chave).sort();

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      }),
    ]);

    const updated = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    const after = updated!.permissions.map((p) => p.permission.chave).sort();
    const added = after.filter((k) => !before.includes(k));
    const removed = before.filter((k) => !after.includes(k));

    if (added.length || removed.length) {
      await this.audit.log({
        userId: actorId,
        acao: 'role.permissions_updated',
        entidade: 'role',
        entidadeId: roleId,
        ip,
        diff: { role: role.nome, added, removed, before, after },
      });
    }

    return updated;
  }

  async getUserPermissions(userId: string, activeRoleId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
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
        extraPermissions: { include: { permission: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const roleId = activeRoleId ?? resolvePrimaryRoleId(user);
    const roleLink =
      user.roleLinks.find((l) => l.roleId === roleId) ??
      (roleId === user.roleId
        ? { roleId: user.role.id, role: user.role, isPrimary: true }
        : null);
    const activeRole = roleLink?.role ?? user.role;

    const rolePermissions = activeRole.permissions.map((p) => ({
      id: p.permission.id,
      chave: p.permission.chave,
    }));
    const extraPermissions = user.extraPermissions.map((p) => ({
      id: p.permission.id,
      chave: p.permission.chave,
    }));
    const roleKeys = new Set(rolePermissions.map((p) => p.chave));
    const effectiveKeys = resolveEffectivePermissions(user, roleId);
    const effectivePermissions = effectiveKeys.map((chave) => {
      const fromRole = rolePermissions.find((p) => p.chave === chave);
      const fromExtra = extraPermissions.find((p) => p.chave === chave);
      return {
        id: (fromRole ?? fromExtra)!.id,
        chave,
        source: roleKeys.has(chave) ? ('role' as const) : ('extra' as const),
      };
    });

    return {
      userId: user.id,
      userNome: user.nome,
      activeRoleId: roleId,
      role: {
        id: activeRole.id,
        nome: activeRole.nome,
        permissions: rolePermissions,
      },
      linkedRoles: user.roleLinks.map((l) => ({
        id: l.role.id,
        nome: l.role.nome,
        isPrimary: l.isPrimary,
      })),
      extraPermissions,
      effectivePermissions,
    };
  }

  async setUserExtraPermissions(
    userId: string,
    permissionIds: string[],
    actorId?: string,
    ip?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
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
        extraPermissions: { include: { permission: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const roleId = resolvePrimaryRoleId(user);
    const activeRole =
      user.roleLinks.find((l) => l.roleId === roleId)?.role ?? user.role;

    const rolePermissionIds = new Set(
      activeRole.permissions.map((p) => p.permission.id),
    );
    const filteredIds = permissionIds.filter((id) => !rolePermissionIds.has(id));

    const before = user.extraPermissions.map((p) => p.permission.chave).sort();

    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId } }),
      this.prisma.userPermission.createMany({
        data: filteredIds.map((permissionId) => ({ userId, permissionId })),
        skipDuplicates: true,
      }),
    ]);

    const result = await this.getUserPermissions(userId);
    const after = result.extraPermissions.map((p) => p.chave).sort();
    const added = after.filter((k) => !before.includes(k));
    const removed = before.filter((k) => !after.includes(k));

    if (added.length || removed.length) {
      await this.audit.log({
        userId: actorId,
        acao: 'user.extra_permissions_updated',
        entidade: 'user',
        entidadeId: userId,
        ip,
        diff: {
          userNome: user.nome,
          role: activeRole.nome,
          added,
          removed,
          before,
          after,
        },
      });
    }

    return result;
  }
}
