import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ExportModule } from '../export/export.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdministrationController } from './administration.controller';
import { AdministrationService } from './administration.service';
import { KeywordExportController } from './keyword-export.controller';
import { KeywordExportService } from './keyword-export.service';
import { S3BackupService } from './s3-backup.service';
import { SystemBackupController } from './system-backup.controller';
import { SystemBackupService } from './system-backup.service';

@Module({
  imports: [PrismaModule, AuditModule, ExportModule],
  controllers: [AdministrationController, SystemBackupController, KeywordExportController],
  providers: [AdministrationService, SystemBackupService, S3BackupService, KeywordExportService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
