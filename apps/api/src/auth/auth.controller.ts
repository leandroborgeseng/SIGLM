import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public, SkipMustChangePassword } from './auth.constants';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto, LoginDto, RefreshDto, SwitchContextDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthUser } from './auth.constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.senha, req.ip);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, req.ip);
  }

  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id, {
      activeRoleId: user.activeRoleId,
      activeOrgaoId: user.activeOrgaoId,
      activeOrgaoAll: user.activeOrgaoAll,
    });
  }

  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @Post('switch-context')
  switchContext(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchContextDto,
    @Req() req: Request,
  ) {
    return this.auth.switchContext(user.id, dto, req.ip);
  }

  @SkipMustChangePassword()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(
      user.id,
      dto.senhaAtual,
      dto.novaSenha,
      dto.confirmacaoSenha,
      req.ip,
    );
  }
}
