import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { AdministrationService } from './administration.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdministrationController {
  constructor(private readonly admin: AdministrationService) {}

  // ─── Órgãos ────────────────────────────────────────────────────────────────

  @Get('organs')
  @RequirePermissions('acts:read')
  listOrgans(@Query('ativos') ativos?: string) {
    return this.admin.listOrgans(ativos !== 'true');
  }

  @Post('organs')
  @RequirePermissions('users:manage')
  createOrgan(@Body() body: { nome: string; sigla?: string | null }) {
    return this.admin.createOrgan(body.nome, body.sigla);
  }

  @Patch('organs/:id')
  @RequirePermissions('users:manage')
  updateOrgan(
    @Param('id') id: string,
    @Body() body: { nome?: string; sigla?: string | null; ativo?: boolean },
  ) {
    return this.admin.updateOrgan(id, body);
  }

  // ─── Meios de publicação ───────────────────────────────────────────────────

  @Get('publication-media')
  @RequirePermissions('acts:read')
  listPublicationMedia(@Query('ativos') ativos?: string) {
    return this.admin.listPublicationMedia(ativos !== 'true');
  }

  @Post('publication-media')
  @RequirePermissions('users:manage')
  createPublicationMedium(@Body() body: { nome: string }) {
    return this.admin.createPublicationMedium(body.nome);
  }

  @Patch('publication-media/:id')
  @RequirePermissions('users:manage')
  updatePublicationMedium(
    @Param('id') id: string,
    @Body() body: { nome?: string; ativo?: boolean },
  ) {
    return this.admin.updatePublicationMedium(id, body);
  }

  // ─── Signatários ───────────────────────────────────────────────────────────

  @Get('signatories')
  @RequirePermissions('acts:read')
  listSignatories(@Query('ativos') ativos?: string) {
    return this.admin.listSignatories(ativos !== 'true');
  }

  @Post('signatories')
  @RequirePermissions('users:manage')
  createSignatory(@Body() body: { nome: string; cargo: string; orgaoId?: string | null }) {
    return this.admin.createSignatory(body);
  }

  @Patch('signatories/:id')
  @RequirePermissions('users:manage')
  updateSignatory(
    @Param('id') id: string,
    @Body()
    body: { nome?: string; cargo?: string; orgaoId?: string | null; ativo?: boolean },
  ) {
    return this.admin.updateSignatory(id, body);
  }

  // ─── Usuários ──────────────────────────────────────────────────────────────

  @Get('users')
  @RequirePermissions('users:manage')
  listUsers() {
    return this.admin.listUsers();
  }

  @Post('users')
  @RequirePermissions('users:manage')
  createUser(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      nome: string;
      email: string;
      senha: string;
      roleIds: string[];
      primaryRoleId?: string;
      orgaoIds?: string[];
      primaryOrgaoId?: string;
      mustChangePassword?: boolean;
    },
    @Req() req: Request,
  ) {
    return this.admin.createUser(body, user.id, req.ip);
  }

  @Patch('users/:id')
  @RequirePermissions('users:manage')
  updateUser(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body()
    body: {
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
    @Req() req: Request,
  ) {
    return this.admin.updateUser(id, body, user.id, req.ip);
  }

  // ─── Permissões ────────────────────────────────────────────────────────────

  @Get('roles')
  @RequirePermissions('users:manage')
  listRoles() {
    return this.admin.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('users:manage')
  listPermissions() {
    return this.admin.listPermissions();
  }

  @Patch('roles/:id/permissions')
  @RequirePermissions('users:manage')
  setRolePermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { permissionIds: string[] },
    @Req() req: Request,
  ) {
    return this.admin.setRolePermissions(id, body.permissionIds ?? [], user.id, req.ip);
  }

  @Get('users/:id/permissions')
  @RequirePermissions('users:manage')
  getUserPermissions(@Param('id') id: string) {
    return this.admin.getUserPermissions(id);
  }

  @Patch('users/:id/permissions')
  @RequirePermissions('users:manage')
  setUserExtraPermissions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { permissionIds: string[] },
    @Req() req: Request,
  ) {
    return this.admin.setUserExtraPermissions(id, body.permissionIds ?? [], user.id, req.ip);
  }
}
