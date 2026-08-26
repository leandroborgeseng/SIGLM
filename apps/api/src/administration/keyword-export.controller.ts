import { Body, Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { KeywordExportQueryDto, KeywordExportZipDto } from './keyword-export.dto';
import { KeywordExportService } from './keyword-export.service';

@Controller('admin/keyword-export')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class KeywordExportController {
  constructor(private readonly keywordExport: KeywordExportService) {}

  @Get('keywords')
  @RequirePermissions('users:manage')
  listKeywords() {
    return this.keywordExport.listKeywords();
  }

  @Get()
  @RequirePermissions('users:manage')
  listByKeyword(@Query() query: KeywordExportQueryDto) {
    return this.keywordExport.findByKeyword(query.keyword);
  }

  @Post('zip')
  @RequirePermissions('users:manage')
  async streamZip(@Body() body: KeywordExportZipDto, @Res() res: Response) {
    await this.keywordExport.streamZip(res, body.keyword, body.actIds);
  }
}
