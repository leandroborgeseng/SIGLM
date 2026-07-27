import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ConsolidationModule } from '../consolidation/consolidation.module';
import { ImportModule } from '../import/import.module';
import { AdminActsController, PublicActsController } from './normative-acts.controller';
import { NormativeActsService } from './normative-acts.service';

@Module({
  imports: [ConsolidationModule, ImportModule, AttachmentsModule],
  controllers: [PublicActsController, AdminActsController],
  providers: [NormativeActsService],
  exports: [NormativeActsService],
})
export class NormativeActsModule {}
