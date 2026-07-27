import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdministrationController } from './administration.controller';
import { AdministrationService } from './administration.service';
import { S3BackupService } from './s3-backup.service';
import { SystemBackupController } from './system-backup.controller';
import { SystemBackupService } from './system-backup.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AdministrationController, SystemBackupController],
  providers: [AdministrationService, SystemBackupService, S3BackupService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
