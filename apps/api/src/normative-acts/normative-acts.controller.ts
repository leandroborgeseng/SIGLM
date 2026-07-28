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
  BatchUpdateActsDto,
  CreateActDto,
  DeleteUnitDto,
  SaveLegislativeEffectsDto,
  SaveUnitsDto,
  StructureFromOriginalDto,
  UpdateIdentifiedImportTextDto,
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
    @Query('orgaoOrigemId') orgaoOrigemId?: string,
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
      orgaoOrigemId,
      page: page ? Number(page) : 1,
    });
  }

  @Get('public/acts/filters/orgaos')
  filterOrgaos() {
    return this.acts.getPublicOriginOrgs();
  }

  @Get('public/acts/filters')
  filters(
    @Query('q') q?: string,
    @Query('tipo') tipo?: ActType,
    @Query('situacao') situacao?: ActSituacao,
    @Query('ano') ano?: string,
    @Query('numero') numero?: string,
    @Query('assunto') assunto?: string,
    @Query('publicadoDe') publicadoDe?: string,
    @Query('publicadoAte') publicadoAte?: string,
    @Query('orgaoOrigemId') orgaoOrigemId?: string,
  ) {
    return this.acts.getFilterCounts({
      q,
      tipo,
      situacao,
      ano: ano ? Number(ano) : undefined,
      numero: numero ? Number(numero) : undefined,
      assunto,
      publicadoDe,
      publicadoAte,
      orgaoOrigemId,
    });
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
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('tipo') tipo?: ActType,
    @Query('situacao') situacao?: ActSituacao,
    @Query('statusPublicacao') statusPublicacao?: PublicationStatus,
    @Query('etapaEditorial') etapaEditorial?: EditorialStage,
    @Query('norma') norma?: string,
    @Query('ementa') ementa?: string,
    @Query('publicadoDe') publicadoDe?: string,
    @Query('publicadoAte') publicadoAte?: string,
    @Query('orgaoOrigemId') orgaoOrigemId?: string,
    @Query('numeroDe') numeroDe?: string,
    @Query('numeroAte') numeroAte?: string,
    @Query('meioPublicacaoId') meioPublicacaoId?: string,
    @Query('signatarioNome') signatarioNome?: string,
    @Query('responsavelEstruturacaoId') responsavelEstruturacaoId?: string,
    @Query('responsavelRevisaoId') responsavelRevisaoId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parseNum = (v?: string) => {
      if (!v?.trim()) return undefined;
      const cleaned = v.replace(/\./g, '').replace(/,/g, '');
      const n = Number(cleaned);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
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
      orgaoOrigemId,
      scopeOrgaoId:
        !user.activeOrgaoAll && user.activeOrgaoId ? user.activeOrgaoId : undefined,
      numeroDe: parseNum(numeroDe),
      numeroAte: parseNum(numeroAte),
      meioPublicacaoId,
      signatarioNome,
      responsavelEstruturacaoId,
      responsavelRevisaoId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('filter-options')
  filterOptions() {
    return this.acts.getAdminFilterOptions();
  }

  @Get('kpis')
  kpis() {
    return this.acts.getAdminKpis();
  }

  @Post('batch')
  @RequirePermissions('acts:write')
  batchUpdate(@Body() dto: BatchUpdateActsDto, @CurrentUser() user: AuthUser) {
    return this.acts.batchUpdateActs(dto, user);
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
  detail(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.getAdminById(id, user);
  }

  @Patch(':id')
  @RequirePermissions('acts:write')
  update(@Param('id') id: string, @Body() dto: UpdateActDto, @CurrentUser() user: AuthUser) {
    return this.acts.updateAct(id, dto, user);
  }

  @Put(':id/units')
  @RequirePermissions('acts:write')
  saveUnits(@Param('id') id: string, @Body() dto: SaveUnitsDto, @CurrentUser() user: AuthUser) {
    return this.acts.saveUnits(id, dto, user);
  }

  @Put(':id/legislative-effects')
  @RequirePermissions('acts:write')
  saveLegislativeEffects(
    @Param('id') id: string,
    @Body() dto: SaveLegislativeEffectsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.saveLegislativeEffects(id, dto, user);
  }

  @Post(':id/units')
  @RequirePermissions('acts:write')
  addUnit(@Param('id') id: string, @Body() dto: AddUnitDto, @CurrentUser() user: AuthUser) {
    return this.acts.addUnit(id, dto, user);
  }

  @Delete(':id/units/:unitId')
  @RequirePermissions('acts:write')
  deleteUnit(
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Body() dto: DeleteUnitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.deleteUnit(id, unitId, dto, user);
  }

  @Post(':id/submit-review')
  @RequirePermissions('acts:write')
  submitReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.submitForReview(id, user);
  }

  @Post(':id/return-to-structuring')
  @RequirePermissions('acts:write')
  returnToStructuring(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.returnToStructuring(id, user);
  }

  @Post(':id/create-edition')
  @RequirePermissions('acts:version')
  createEdition(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.createEdition(id, user);
  }

  @Post(':id/start-structuring')
  @RequirePermissions('acts:write')
  startStructuring(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.startStructuring(id, user);
  }

  @Post(':id/structure-from-original')
  @RequirePermissions('acts:write')
  structureFromOriginal(
    @Param('id') id: string,
    @Body() dto: StructureFromOriginalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.structureFromOriginal(id, dto, user);
  }

  @Patch(':id/identified-import-text')
  @RequirePermissions('acts:write')
  updateIdentifiedImportText(
    @Param('id') id: string,
    @Body() dto: UpdateIdentifiedImportTextDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.updateIdentifiedImportText(id, dto, user.id);
  }

  @Post(':id/identify-text-from-original')
  @RequirePermissions('acts:write')
  identifyTextFromOriginal(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.identifyTextFromOriginal(id, user.id);
  }

  @Post(':id/publish')
  @RequirePermissions('acts:publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.acts.publish(id, user);
  }

  @Post(':id/units/:unitId/restore/:versionId')
  @RequirePermissions('acts:write')
  restoreVersion(
    @Param('id') id: string,
    @Param('unitId') unitId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.acts.restoreUnitVersion(id, unitId, versionId, user);
  }
}
