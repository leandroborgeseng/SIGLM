import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import * as path from 'path';
import { RequirePermissions } from '../auth/auth.constants';
import type { AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { setUserFileHeaders } from '../common/file-response';
import { AttachmentsService } from './attachments.service';

@Controller('admin/acts/:actId/attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('acts:read')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  list(@Param('actId') actId: string) {
    return this.attachments.listForAct(actId);
  }

  @Get(':attachmentId/file')
  async file(
    @Param('actId') actId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const item = await this.attachments.getFilePath(actId, attachmentId);
    setUserFileHeaders(res, item.nome);
    return res.sendFile(path.resolve(item.absolutePath));
  }

  @Post('original')
  @RequirePermissions('acts:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 40 * 1024 * 1024 },
    }),
  )
  uploadOriginal(
    @Param('actId') actId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.uploadOriginal(actId, file, user.id);
  }

  @Post('publicacao')
  @RequirePermissions('acts:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 40 * 1024 * 1024 },
    }),
  )
  uploadPublication(
    @Param('actId') actId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.uploadPublicationFile(actId, file, user.id);
  }

  @Post('supplements')
  @RequirePermissions('acts:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 40 * 1024 * 1024 },
    }),
  )
  createSupplement(
    @Param('actId') actId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      secao: 'topo' | 'final';
      titulo: string;
      modo: 'arquivo' | 'hiperlink';
      href?: string;
      ordem?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.createSupplement(
      actId,
      {
        secao: body.secao,
        titulo: body.titulo,
        modo: body.modo,
        href: body.href,
        ordem: body.ordem != null ? Number(body.ordem) : undefined,
      },
      file,
      user.id,
    );
  }

  @Patch('supplements/:attachmentId')
  @RequirePermissions('acts:write')
  updateSupplement(
    @Param('actId') actId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: { titulo?: string; href?: string; ordem?: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.updateSupplement(actId, attachmentId, body, user.id);
  }

  @Put('supplements/reorder')
  @RequirePermissions('acts:write')
  reorder(
    @Param('actId') actId: string,
    @Body() body: { secao: 'topo' | 'final'; orderedIds: string[] },
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.reorderSupplements(
      actId,
      body.secao,
      body.orderedIds ?? [],
      user.id,
    );
  }

  @Delete('supplements/:attachmentId')
  @RequirePermissions('acts:write')
  remove(
    @Param('actId') actId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.removeSupplement(actId, attachmentId, user.id);
  }
}

/** Manutenção de vínculos de arquivos (fora do escopo de um ato específico). */
@Controller('admin/attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttachmentsMaintenanceController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('integrity')
  @RequirePermissions('users:manage')
  integrity() {
    return this.attachments.repairBrokenOriginals();
  }

  @Post('repair-originals')
  @RequirePermissions('users:manage')
  repair() {
    return this.attachments.repairBrokenOriginals();
  }
}
