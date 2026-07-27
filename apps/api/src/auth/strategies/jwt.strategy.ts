import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser, JwtPayload } from '../auth.constants';
import {
  resolveEffectivePermissions,
  resolveLinkedOrgs,
  resolveLinkedRoles,
  userContextInclude,
  userCanAccessAllOrgs,
} from '../effective-permissions';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET é obrigatório em produção');
  }
  return 'dev-secret';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: userContextInclude,
    });

    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    if (user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException('Sessão invalidada. Faça login novamente.');
    }

    const activeRoleId = payload.activeRoleId ?? user.roleId;
    const permissions = resolveEffectivePermissions(user, activeRoleId);
    const activeRole =
      user.roleLinks.find((l) => l.roleId === activeRoleId)?.role ?? user.role;
    const activeOrg = payload.activeOrgaoAll
      ? null
      : user.orgLinks.find((l) => l.orgaoId === payload.activeOrgaoId)?.orgao ?? null;

    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: activeRole.nome,
      activeRoleId,
      activeOrgaoId: payload.activeOrgaoAll ? null : payload.activeOrgaoId ?? null,
      activeOrgaoAll: payload.activeOrgaoAll ?? false,
      activeOrgaoNome: payload.activeOrgaoAll ? 'Todos os órgãos' : activeOrg?.nome ?? null,
      permissions,
      mustChangePassword: user.mustChangePassword,
      linkedRoles: resolveLinkedRoles(user),
      linkedOrgs: resolveLinkedOrgs(user),
      canAccessAllOrgs: userCanAccessAllOrgs(permissions),
    };
  }
}
