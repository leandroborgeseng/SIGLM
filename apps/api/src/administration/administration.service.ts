import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Órgãos de origem ──────────────────────────────────────────────────────

  listOrgans(includeInactive = true) {
    return this.prisma.originOrg.findMany({
      where: includeInactive ? undefined : { ativo: true },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { acts: true } } },
    });
  }

  async createOrgan(nome: string) {
    const trimmed = nome.trim();
    if (trimmed.length < 2) throw new BadRequestException('Nome do órgão inválido');
    const existing = await this.prisma.originOrg.findFirst({
      where: { nome: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException('Já existe um órgão com este nome');
    return this.prisma.originOrg.create({ data: { nome: trimmed, ativo: true } });
  }

  async updateOrgan(id: string, data: { nome?: string; ativo?: boolean }) {
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
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });

    if (data.nome) {
      await this.prisma.normativeAct.updateMany({
        where: { orgaoOrigemId: id },
        data: { orgaoOrigem: data.nome },
      });
    }

    return updated;
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
        createdAt: true,
        role: { select: { id: true, nome: true, descricao: true } },
      },
    });
  }

  async createUser(data: { nome: string; email: string; senha: string; roleId: string }) {
    const email = data.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');
    const role = await this.prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) throw new BadRequestException('Perfil inválido');
    if (data.senha.length < 6) throw new BadRequestException('Senha deve ter ao menos 6 caracteres');

    const hashSenha = await bcrypt.hash(data.senha, 10);
    return this.prisma.user.create({
      data: {
        nome: data.nome.trim(),
        email,
        hashSenha,
        roleId: data.roleId,
        ativo: true,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        role: { select: { id: true, nome: true, descricao: true } },
      },
    });
  }

  async updateUser(
    id: string,
    data: { nome?: string; email?: string; senha?: string; roleId?: string; ativo?: boolean },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    if (data.email) {
      const email = data.email.toLowerCase().trim();
      const clash = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (clash) throw new ConflictException('E-mail já cadastrado');
      data.email = email;
    }

    if (data.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) throw new BadRequestException('Perfil inválido');
    }

    const hashSenha =
      data.senha && data.senha.length >= 6 ? await bcrypt.hash(data.senha, 10) : undefined;
    if (data.senha && data.senha.length > 0 && data.senha.length < 6) {
      throw new BadRequestException('Senha deve ter ao menos 6 caracteres');
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome.trim() }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.roleId !== undefined && { roleId: data.roleId }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
        ...(hashSenha && { hashSenha }),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        role: { select: { id: true, nome: true, descricao: true } },
      },
    });
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

  async setRolePermissions(roleId: string, permissionIds: string[]) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Perfil não encontrado');

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      }),
    ]);

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
  }
}
