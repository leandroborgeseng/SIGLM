import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { RequirePermissions } from '../auth/auth.constants';
import type { AuthUser } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { UpdateS3BackupConfigDto } from './s3-backup.dto';
import { S3BackupService } from './s3-backup.service';
import { SystemBackupService } from './system-backup.service';

@Controller('admin/system')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemBackupController {
  constructor(
    private readonly backup: SystemBackupService,
    private readonly s3Backup: S3BackupService,
  ) {}

  /** Exporta banco + uploads (.tar.gz). Apenas admin_geral. */
  @Get('backup')
  @RequirePermissions('users:manage')
  async exportBackup(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const { filePath, filename, cleanup } = await this.backup.createBackupArchive(user);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = this.backup.openReadStream(filePath);
    const done = () => {
      void cleanup();
    };
    stream.on('close', done);
    stream.on('error', (err) => {
      done();
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || 'Erro ao gerar backup' });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  }

  /** Configuração + status do backup S3 (sem revelar o secret). */
  @Get('backup/s3')
  @RequirePermissions('users:manage')
  s3Status(@CurrentUser() user: AuthUser) {
    this.backup.assertSystemAdmin(user);
    return this.s3Backup.getPublicConfig();
  }

  /** Salva configuração S3 pela interface. */
  @Put('backup/s3')
  @RequirePermissions('users:manage')
  saveS3Config(@CurrentUser() user: AuthUser, @Body() dto: UpdateS3BackupConfigDto) {
    return this.s3Backup.updateConfig(user, dto);
  }

  /** Executa backup S3 agora (mesma retenção do agendamento). */
  @Post('backup/s3/run')
  @RequirePermissions('users:manage')
  runS3Backup(@CurrentUser() user: AuthUser) {
    return this.s3Backup.runNow(user);
  }

  /** Restaura backup completo (substitui dados atuais). Apenas admin_geral. */
  @Post('restore')
  @RequirePermissions('users:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 512 * 1024 * 1024 },
    }),
  )
  restore(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.backup.restoreBackupArchive(user, file);
  }
}
