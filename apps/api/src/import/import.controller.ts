import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ActType } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { RequirePermissions } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ImportService } from './import.service';

@Controller('admin/imports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('imports:manage')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.imports.upload(file, user.id);
  }

  @Get(':id/preview-html')
  async previewHtml(@Param('id') id: string, @Res() res: Response) {
    const html = await this.imports.getDocxPreviewHtml(id);
    const page = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>
      body{font-family:Georgia,serif;padding:1.25rem;line-height:1.65;color:#0F1B2D;font-size:14px}
      p{margin:0 0 .75rem} table{border-collapse:collapse;width:100%} td,th{border:1px solid #E5EAF1;padding:.4rem}
    </style></head><body>${html}</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(page);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const { path: filePath, filename } = await this.imports.getFilePath(id);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(filePath);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.imports.getImportDetail(id);
  }

  @Post(':id/reprocess-ocr')
  @RequirePermissions('imports:manage')
  reprocessOcr(@Param('id') id: string) {
    return this.imports.reprocessOcr(id);
  }

  @Patch(':id/ocr')
  updateOcr(@Param('id') id: string, @Body() body: { pages: { pagina: number; texto: string }[] }) {
    return this.imports.updateOcrText(id, body.pages);
  }

  @Post(':id/ocr/approve')
  @RequirePermissions('ocr:review')
  approveOcr(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.imports.approveOcr(id, user.id);
  }

  @Post(':id/confirm')
  confirm(
    @Param('id') id: string,
    @Body()
    body: {
      tipo?: ActType;
      numero?: number;
      ano?: number;
      ementa?: string;
      orgaoOrigem?: string;
    },
  ) {
    return this.imports.confirmDraft(id, body);
  }
}
