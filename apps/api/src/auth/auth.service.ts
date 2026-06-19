import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, JwtPayload } from './auth.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, senha: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

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

    const permissions = user.role.permissions.map((rp) => rp.permission.chave);
    const tokens = this.issueTokens(user.id, user.email, user.role.nome, permissions);

    await this.audit.log({
      userId: user.id,
      acao: 'auth.login',
      entidade: 'user',
      entidadeId: user.id,
      ip,
    });

    return {
      ...tokens,
      user: this.toAuthUser(user, permissions),
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

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário inativo ou não encontrado');
    }

    const permissions = user.role.permissions.map((rp) => rp.permission.chave);
    const tokens = this.issueTokens(user.id, user.email, user.role.nome, permissions);

    await this.audit.log({
      userId: user.id,
      acao: 'auth.refresh',
      entidade: 'user',
      entidadeId: user.id,
      ip,
    });

    return { ...tokens, user: this.toAuthUser(user, permissions) };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user || !user.ativo) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    const permissions = user.role.permissions.map((rp) => rp.permission.chave);
    return this.toAuthUser(user, permissions);
  }

  private issueTokens(userId: string, email: string, role: string, permissions: string[]) {
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      role,
      permissions,
      type: 'access',
    };
    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      role,
      permissions,
      type: 'refresh',
    };

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
    user: {
      id: string;
      nome: string;
      email: string;
      role: { nome: string };
    },
    permissions: string[],
  ): AuthUser {
    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role.nome,
      permissions,
    };
  }
}
