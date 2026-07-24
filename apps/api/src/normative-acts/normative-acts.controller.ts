import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActSituacao, ActType, EditorialStage, PublicationStatus } from '@prisma/client';
import { Public, RequirePermissions } from '../auth/auth.constants';
import type { AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  AddUnitDto,
  CreateActDto,
  DeleteUnitDto,
  SaveLegislativeEffectsDto,
  SaveUnitsDto,
  UpdateActDto,
} from './normative-acts.dto';
import { NormativeActsService } from './normative-acts.service';
import { slugFromParams } from './normative-acts.utils';

@Controller()
@Public()
export class PublicActsController {
  constructor(private readonly acts: NormativeActsService) {}

  @Get('public/acts')
  search(
    @Query('q') q?: string,
    @Query('tipo') tipo?: ActType,
    @Query('situacao') situacao?: ActSituacao,
    @Query('ano') ano?: string,
    @Query('numero') numero?: string,
    @Query('assunto') assunto?: string,
    @Query('publicadoDe') publicadoDe?: string,
    @Query('publicadoAte') publicadoAte?: string,
    @Query('page') page?: string,
  ) {
    return this.acts.searchPublic({
      q,
      tipo,
      situacao,
      ano: ano ? Number(ano) : undefined,
      numero: numero ? Number(numero) : undefined,
      assunto,
      publicadoDe,
      publicadoAte,
      page: page ? Number(page) : 1,
    });
  }

  @Get('public/acts/filters')
  filters() {
    return this.acts.getFilterCounts();
  }

  @Get('public/acts/:tipo/:ano/:numero')
  byParams(
    @Param('tipo') tipo: string,
    @Param('ano') ano: string,
    @Param('numero') numero: string,
  ) {
    return this.acts.resolveSlug(slugFromParams(tipo, ano, numero));
  }
}

@Controller('admin/acts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('acts:read')
export class AdminActsController {
  constructor(private readonly acts: NormativeActsService) {}

  @Post()
  @RequirePermissions('acts:write')
  create(@Body() dto: CreateActDto) {
    return this.acts.createAct(dto);
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('tipo') tipo?: ActType,
    @Query('situacao') situacao?: ActSituacao,
    @Query('statusPublicacao') statusPublicacao?: PublicationStatus,
    @Query('etapaEditorial') etapaEditorial?: EditorialStage,
    @Query('norma') norma?: string,
    @Query('ementa') ementa?: string,
    @Query('publicadoDe') publicadoDe?: string,
    @Query('publicadoAte') publicadoAte?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.acts.getAdminList({
      q,
      tipo,
      situacao,
      statusPublicacao,
      etapaEditorial,
      norma,
      ementa,
      publicadoDe,
      publicadoAte,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('kpis')
  kpis() {
    return this.acts.getAdminKpis();
  }

  @Get(':id/history')
  @RequirePermissions('acts:history')
  listHistory(@Param('id') id: string) {
    return this.acts.listInternalHistory(id);
  }

  @Get(':id/history/:entryId')
  @RequirePermissions('acts:history')
  historyEntry(@Param('id') id: string, @Param('entryId') entryId: string) {
    return this.acts.getInternalHistoryEntry(id, entryId);
  }

  @Get(':id/history-compare')
  @RequirePermissions('acts:history')
  compareHistory(
    @Param('id') id: string,
    @Query('left') left: string,
    @Query('right') right: string,
  ) {
    return this.acts.compareInternalHistory(id, left, right);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.acts.getAdminById(id);
  }

  @Patch(':id')
  @RequirePermissions('acts:write')
  update(@Param('id') id: string, @Body() dto: UpdateActDto, @CurrentUser() user: AuthUser) {
    return this.acts.updateAct(id, dto, user.id);
  }

  @Put(':id/units')
  @RequirePermissions('acts:write')
  saveUnits(@Param('id') id: string, @Body() dto: SaveUnitsDto, @CurrentUser() user: AuthUser) {
    return this.acts.saveUnits(id, dto, user.id);
  }

  @Put(':id/legislative-effects')
  @RequirePermissions('acts:write')
  saveLegislativeEffects(
    @Param('id') id: string,
    @Body() dto: SaveLegislativeEffectsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.saveLegislativeEffects(id, dto, user.id);
  }

  @Post(':id/units')
  @RequirePermissions('acts:write')
  addUnit(@Param('id') id: string, @Body() dto: AddUnitDto, @CurrentUser() user: AuthUser) {
    return this.acts.addUnit(id, dto, user.id);
  }

  @Delete(':id/units/:unitId')
  @RequirePermissions('acts:write')
  deleteUnit(
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Body() dto: DeleteUnitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.deleteUnit(id, unitId, dto, user.id);
  }

  @Post(':id/submit-review')
  @RequirePermissions('acts:write')
  submitReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.submitForReview(id, user.id);
  }

  @Post(':id/create-edition')
  @RequirePermissions('acts:version')
  createEdition(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.createEdition(id, user.id);
  }

  @Post(':id/start-structuring')
  @RequirePermissions('acts:write')
  startStructuring(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.startStructuring(id, user.id);
  }

  @Post(':id/publish')
  @RequirePermissions('acts:publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.publish(id, user.id);
  }

  @Post(':id/units/:unitId/restore/:versionId')
  @RequirePermissions('acts:write')
  restoreVersion(
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.restoreUnitVersion(id, unitId, versionId, user.id);
  }
}
