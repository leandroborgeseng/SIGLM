import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../auth.constants';
import type { AuthUser } from '../auth.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAll = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredAny = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredAll?.length && !requiredAny?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();

    if (requiredAll?.length) {
      const hasAll = requiredAll.every((p) => user.permissions.includes(p));
      if (!hasAll) {
        throw new ForbiddenException('Permissão insuficiente');
      }
    }

    if (requiredAny?.length) {
      const hasAny = requiredAny.some((p) => user.permissions.includes(p));
      if (!hasAny) {
        throw new ForbiddenException('Permissão insuficiente');
      }
    }

    return true;
  }
}
