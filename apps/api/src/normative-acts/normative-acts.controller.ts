import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActSituacao, ActType } from '@prisma/client';
import { Public, RequirePermissions } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  AddUnitDto,
  CreateActDto,
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
    @Query('page') page?: string,
  ) {
    return this.acts.searchPublic({
      q,
      tipo,
      situacao,
      ano: ano ? Number(ano) : undefined,
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
    @Query('page') page?: string,
  ) {
    return this.acts.getAdminList({
      q,
      tipo,
      situacao,
      page: page ? Number(page) : 1,
    });
  }

  @Get('kpis')
  kpis() {
    return this.acts.getAdminKpis();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.acts.getAdminById(id);
  }

  @Patch(':id')
  @RequirePermissions('acts:write')
  update(@Param('id') id: string, @Body() dto: UpdateActDto) {
    return this.acts.updateAct(id, dto);
  }

  @Put(':id/units')
  @RequirePermissions('acts:write')
  saveUnits(@Param('id') id: string, @Body() dto: SaveUnitsDto) {
    return this.acts.saveUnits(id, dto);
  }

  @Post(':id/units')
  @RequirePermissions('acts:write')
  addUnit(@Param('id') id: string, @Body() dto: AddUnitDto) {
    return this.acts.addUnit(id, dto);
  }

  @Post(':id/submit-review')
  @RequirePermissions('acts:write')
  submitReview(@Param('id') id: string) {
    return this.acts.submitForReview(id);
  }

  @Post(':id/publish')
  @RequirePermissions('acts:publish')
  publish(@Param('id') id: string) {
    return this.acts.publish(id);
  }
}
