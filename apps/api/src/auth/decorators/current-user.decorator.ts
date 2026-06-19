import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser, JwtPayload } from '../auth.constants';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);

export const CurrentJwt = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ jwt: JwtPayload }>();
    return request.jwt;
  },
);
