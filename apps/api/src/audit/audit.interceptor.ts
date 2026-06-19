import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/auth.constants';
import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const method = req.method.toUpperCase();

    if (!MUTATING.has(method)) return next.handle();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const path = req.route?.path ?? req.url;
    const entidade = path.split('/').filter(Boolean)[0] ?? 'unknown';

    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          userId: req.user?.id,
          acao: `${method.toLowerCase()}.${entidade}`,
          entidade,
          ip: req.ip,
          diff: {
            path: req.url,
            method,
            body: sanitizeBody(req.body),
          } as Prisma.InputJsonValue,
        });
      }),
    );
  }
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...(body as Record<string, unknown>) };
  if ('senha' in copy) copy.senha = '[redacted]';
  if ('hashSenha' in copy) copy.hashSenha = '[redacted]';
  if ('password' in copy) copy.password = '[redacted]';
  return copy;
}
