import { AdministrationModule } from './administration/administration.module';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ConsolidationModule } from './consolidation/consolidation.module';
import { ExportModule } from './export/export.module';
import { ImportModule } from './import/import.module';
import { NormativeActsModule } from './normative-acts/normative-acts.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    NormativeActsModule,
    AttachmentsModule,
    ConsolidationModule,
    ImportModule,
    ExportModule,
    AdministrationModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
})
export class AppModule {}
