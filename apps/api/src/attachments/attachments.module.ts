import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AttachmentsController,
  AttachmentsMaintenanceController,
} from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [PrismaModule],
  controllers: [AttachmentsController, AttachmentsMaintenanceController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
