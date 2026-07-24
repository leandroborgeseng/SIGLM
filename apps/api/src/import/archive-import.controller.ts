import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ActType } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { RequirePermissions } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ArchiveImportService } from './archive-import.service';

@Controller('admin/archive-imports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('imports:manage')
export class ArchiveImportController {
  constructor(private readonly archive: ArchiveImportService) {}

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 100, {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[], @CurrentUser() user: AuthUser) {
    return this.archive.uploadBatch(files ?? [], user.id);
  }

  @Get(':batchId')
  detail(@Param('batchId') batchId: string) {
    return this.archive.getBatch(batchId);
  }

  @Get(':batchId/items/:itemId/file')
  async file(
    @Param('batchId') batchId: string,
    @Param('itemId') itemId: string,
    @Res() res: Response,
  ) {
    const { path: filePath, filename } = await this.archive.getItemFilePath(batchId, itemId);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.sendFile(filePath);
  }

  @Patch(':batchId/items/:itemId')
  updateItem(
    @Param('batchId') batchId: string,
    @Param('itemId') itemId: string,
    @Body()
    body: {
      tipo?: ActType | null;
      numero?: number | null;
      ano?: number | null;
      dataAto?: string | null;
      ementa?: string | null;
      resolucao?: 'ignore' | 'link' | 'create' | null;
    },
  ) {
    return this.archive.updateItem(batchId, itemId, body);
  }

  @Post(':batchId/confirm')
  confirm(
    @Param('batchId') batchId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { itemIds?: string[] },
  ) {
    return this.archive.confirmBatch(batchId, user.id, { itemIds: body.itemIds ?? [] });
  }
}
