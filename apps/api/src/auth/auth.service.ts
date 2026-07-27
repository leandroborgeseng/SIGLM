import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, JwtPayload } from './auth.constants';
import { assertPasswordPolicy } from './password-policy';
import {
  resolveEffectivePermissions,
  resolveLinkedOrgs,
  resolveLinkedRoles,
  resolvePrimaryOrgaoId,
  resolvePrimaryRoleId,
  userContextInclude,
  type UserWithContext,
  userCanAccessAllOrgs,
} from './effective-permissions';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly failedPasswordAttempts = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, senha: string, ip?: string) {
    const user = await this.loadUserContext(email.toLowerCase().trim());

    if (!user || !user.ativo) {
      await this.audit.log({
        acao: 'auth.login_failed',
        entidade: 'user',
        ip,
        diff: { email },
      });
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const valid = await bcrypt.compare(senha, user.hashSenha);
    if (!valid) {
      await this.audit.log({
        userId: user.id,
        acao: 'auth.login_failed',
        entidade: 'user',
        entidadeId: user.id,
        ip,
      });
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const session = this.buildSessionContext(user);
    const tokens = this.issueTokens(user, session);

    await this.audit.log({
      userId: user.id,
      acao: 'auth.login',
      entidade: 'user',
      entidadeId: user.id,
      ip,
      diff: {
        activeRoleId: session.activeRoleId,
        activeOrgaoId: session.activeOrgaoId,
        activeOrgaoAll: session.activeOrgaoAll,
      },
    });

    return {
      ...tokens,
      user: this.toAuthUser(user, session),
    };
  }

  async refresh(refreshToken: string, ip?: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.loadUserContextById(payload.sub);

    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    if (user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException('Sessão invalidada. Faça login novamente.');
    }

    const session = this.buildSessionContext(user, {
      activeRoleId: payload.activeRoleId,
      activeOrgaoId: payload.activeOrgaoId,
      activeOrgaoAll: payload.activeOrgaoAll,
    });
    const tokens = this.issueTokens(user, session);

    await this.audit.log({
      userId: user.id,
      acao: 'auth.refresh',
      entidade: 'user',
      entidadeId: user.id,
      ip,
    });

    return { ...tokens, user: this.toAuthUser(user, session) };
  }

  async me(userId: string, context?: {
    activeRoleId?: string;
    activeOrgaoId?: string | null;
    activeOrgaoAll?: boolean;
  }): Promise<AuthUser> {
    const user = await this.loadUserContextById(userId);

    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const session = this.buildSessionContext(user, context);
    return this.toAuthUser(user, session);
  }

  async switchContext(
    userId: string,
    data: { roleId?: string; orgaoId?: string | 'all' },
    ip?: string,
  ) {
    const user = await this.loadUserContextById(userId);
    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const current = this.buildSessionContext(user);
    let nextRoleId = current.activeRoleId;
    let nextOrgaoId = current.activeOrgaoId;
    let nextOrgaoAll = current.activeOrgaoAll;

    if (data.roleId !== undefined) {
      const linked = user.roleLinks.some((l) => l.roleId === data.roleId);
      if (!linked && data.roleId !== user.roleId) {
        throw new BadRequestException('Perfil não vinculado a este usuário');
      }
      nextRoleId = data.roleId;
    }

    const permissionsForRole = resolveEffectivePermissions(user, nextRoleId);
    const canAllOrgs = userCanAccessAllOrgs(permissionsForRole);

    if (data.orgaoId !== undefined) {
      if (data.orgaoId === 'all') {
        if (!canAllOrgs) {
          throw new BadRequestException('Sem permissão para acessar todos os órgãos');
        }
        nextOrgaoAll = true;
        nextOrgaoId = null;
      } else {
        const linked = user.orgLinks.some((l) => l.orgaoId === data.orgaoId);
        if (!linked) {
          throw new BadRequestException('Órgão não vinculado a este usuário');
        }
        nextOrgaoAll = false;
        nextOrgaoId = data.orgaoId;
      }
    } else if (!canAllOrgs) {
      nextOrgaoAll = false;
      if (!nextOrgaoId || !user.orgLinks.some((l) => l.orgaoId === nextOrgaoId)) {
        nextOrgaoId = resolvePrimaryOrgaoId(user);
      }
    }

    const session = {
      activeRoleId: nextRoleId,
      activeOrgaoId: nextOrgaoAll ? null : nextOrgaoId,
      activeOrgaoAll: nextOrgaoAll,
      permissions: permissionsForRole,
    };

    const tokens = this.issueTokens(user, session);

    await this.audit.log({
      userId,
      acao: 'auth.context_switched',
      entidade: 'user',
      entidadeId: userId,
      ip,
      diff: {
        before: {
          activeRoleId: current.activeRoleId,
          activeOrgaoId: current.activeOrgaoId,
          activeOrgaoAll: current.activeOrgaoAll,
        },
        after: {
          activeRoleId: session.activeRoleId,
          activeOrgaoId: session.activeOrgaoId,
          activeOrgaoAll: session.activeOrgaoAll,
        },
      },
    });

    return { ...tokens, user: this.toAuthUser(user, session) };
  }

  async changePassword(
    userId: string,
    senhaAtual: string,
    novaSenha: string,
    confirmacaoSenha: string,
    ip?: string,
  ) {
    if (novaSenha !== confirmacaoSenha) {
      throw new BadRequestException('A confirmação da senha não confere');
    }

    assertPasswordPolicy(novaSenha);

    this.assertNotRateLimited(userId);

    const user = await this.loadUserContextById(userId);
    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const valid = await bcrypt.compare(senhaAtual, user.hashSenha);
    if (!valid) {
      this.recordFailedAttempt(userId);
      await this.audit.log({
        userId,
        acao: 'auth.password_change_failed',
        entidade: 'user',
        entidadeId: userId,
        ip,
      });
      throw new UnauthorizedException('Senha atual incorreta');
    }

    this.clearFailedAttempts(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        hashSenha: await bcrypt.hash(novaSenha, 10),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
      include: userContextInclude,
    });

    const session = this.buildSessionContext(updated);
    const tokens = this.issueTokens(updated, session);

    await this.audit.log({
      userId,
      acao: 'auth.password_changed_own',
      entidade: 'user',
      entidadeId: userId,
      ip,
    });

    return { ...tokens, user: this.toAuthUser(updated, session) };
  }

  private async loadUserContext(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: userContextInclude,
    });
  }

  private async loadUserContextById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: userContextInclude,
    });
  }

  private buildSessionContext(
    user: UserWithContext,
    override?: {
      activeRoleId?: string;
      activeOrgaoId?: string | null;
      activeOrgaoAll?: boolean;
    },
  ) {
    const activeRoleId = override?.activeRoleId ?? resolvePrimaryRoleId(user);
    const permissions = resolveEffectivePermissions(user, activeRoleId);
    const canAllOrgs = userCanAccessAllOrgs(permissions);

    let activeOrgaoAll = override?.activeOrgaoAll ?? false;
    let activeOrgaoId = override?.activeOrgaoId ?? resolvePrimaryOrgaoId(user);

    if (!canAllOrgs) {
      activeOrgaoAll = false;
      if (!activeOrgaoId || !user.orgLinks.some((l) => l.orgaoId === activeOrgaoId)) {
        activeOrgaoId = resolvePrimaryOrgaoId(user);
      }
    } else if (activeOrgaoAll) {
      activeOrgaoId = null;
    }

    return {
      activeRoleId,
      activeOrgaoId: activeOrgaoAll ? null : activeOrgaoId,
      activeOrgaoAll,
      permissions,
    };
  }

  private issueTokens(
    user: UserWithContext,
    session: {
      activeRoleId: string;
      activeOrgaoId: string | null;
      activeOrgaoAll: boolean;
      permissions: string[];
    },
  ) {
    const activeRole =
      user.roleLinks.find((l) => l.roleId === session.activeRoleId)?.role ??
      user.role;

    const base = {
      sub: user.id,
      email: user.email,
      role: activeRole.nome,
      activeRoleId: session.activeRoleId,
      activeOrgaoId: session.activeOrgaoId,
      activeOrgaoAll: session.activeOrgaoAll,
      permissions: session.permissions,
      sessionVersion: user.sessionVersion,
      mustChangePassword: user.mustChangePassword,
    };

    const accessPayload: JwtPayload = { ...base, type: 'access' };
    const refreshPayload: JwtPayload = { ...base, type: 'refresh' };

    const accessToken = this.jwt.sign(accessPayload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private toAuthUser(
    user: UserWithContext,
    session: {
      activeRoleId: string;
      activeOrgaoId: string | null;
      activeOrgaoAll: boolean;
      permissions: string[];
    },
  ): AuthUser {
    const activeRole =
      user.roleLinks.find((l) => l.roleId === session.activeRoleId)?.role ??
      user.role;
    const activeOrg = session.activeOrgaoAll
      ? null
      : user.orgLinks.find((l) => l.orgaoId === session.activeOrgaoId)?.orgao ?? null;

    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: activeRole.nome,
      activeRoleId: session.activeRoleId,
      activeOrgaoId: session.activeOrgaoId,
      activeOrgaoAll: session.activeOrgaoAll,
      activeOrgaoNome: session.activeOrgaoAll ? 'Todos os órgãos' : activeOrg?.nome ?? null,
      permissions: session.permissions,
      mustChangePassword: user.mustChangePassword,
      linkedRoles: resolveLinkedRoles(user),
      linkedOrgs: resolveLinkedOrgs(user),
      canAccessAllOrgs: userCanAccessAllOrgs(session.permissions),
    };
  }

  private assertNotRateLimited(userId: string) {
    const entry = this.failedPasswordAttempts.get(userId);
    if (!entry) return;
    if (Date.now() > entry.resetAt) {
      this.failedPasswordAttempts.delete(userId);
      return;
    }
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      throw new HttpException(
        'Muitas tentativas com senha incorreta. Tente novamente em alguns minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailedAttempt(userId: string) {
    const now = Date.now();
    const entry = this.failedPasswordAttempts.get(userId);
    if (!entry || now > entry.resetAt) {
      this.failedPasswordAttempts.set(userId, { count: 1, resetAt: now + LOCKOUT_MS });
      return;
    }
    entry.count += 1;
  }

  private clearFailedAttempts(userId: string) {
    this.failedPasswordAttempts.delete(userId);
  }
}
