import { Module } from '@nestjs/common';
import { ConsolidationModule } from '../consolidation/consolidation.module';
import { AdminActsController, PublicActsController } from './normative-acts.controller';
import { NormativeActsService } from './normative-acts.service';

@Module({
  imports: [ConsolidationModule],
  controllers: [PublicActsController, AdminActsController],
  providers: [NormativeActsService],
  exports: [NormativeActsService],
})
export class NormativeActsModule {}
