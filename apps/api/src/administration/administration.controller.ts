import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
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
  createOrgan(@Body() body: { nome: string }) {
    return this.admin.createOrgan(body.nome);
  }

  @Patch('organs/:id')
  @RequirePermissions('users:manage')
  updateOrgan(@Param('id') id: string, @Body() body: { nome?: string; ativo?: boolean }) {
    return this.admin.updateOrgan(id, body);
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
    @Body() body: { nome: string; email: string; senha: string; roleId: string },
  ) {
    return this.admin.createUser(body);
  }

  @Patch('users/:id')
  @RequirePermissions('users:manage')
  updateUser(
    @Param('id') id: string,
    @Body()
    body: { nome?: string; email?: string; senha?: string; roleId?: string; ativo?: boolean },
  ) {
    return this.admin.updateUser(id, body);
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
  setRolePermissions(@Param('id') id: string, @Body() body: { permissionIds: string[] }) {
    return this.admin.setRolePermissions(id, body.permissionIds ?? []);
  }
}
