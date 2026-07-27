import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import {
  ApplyConsolidationDto,
  ConsolidationPreviewDto,
  CorrectConsolidationLinkDto,
  ListConsolidationLinksQuery,
  RegisterExternalEffectDto,
} from './consolidation.dto';
import { ConsolidationService } from './consolidation.service';

@Controller('admin/consolidation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('acts:consolidate')
export class ConsolidationController {
  constructor(private readonly consolidation: ConsolidationService) {}

  @Get('acts')
  listActs() {
    return this.consolidation.listActs();
  }

  @Get('acts/:id/units')
  listUnits(@Param('id') id: string) {
    return this.consolidation.listUnits(id);
  }

  @Get('links')
  listLinks(@Query() query: ListConsolidationLinksQuery) {
    return this.consolidation.listLinks(query);
  }

  @Patch('links/:id')
  correctLink(
    @Param('id') id: string,
    @Body() dto: CorrectConsolidationLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consolidation.correctLink(id, dto, user.id);
  }

  @Post('preview')
  preview(@Body() dto: ConsolidationPreviewDto) {
    return this.consolidation.preview(dto);
  }

  /** Bloqueado — consolidação interna via efeitos legislativos no editor. */
  @Post('apply')
  apply(@Body() dto: ApplyConsolidationDto, @CurrentUser() user: AuthUser) {
    return this.consolidation.apply(dto, user.id);
  }

  @Post('external')
  registerExternal(
    @Body() dto: RegisterExternalEffectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.consolidation.registerExternalEffect(dto, user.id);
  }
}
