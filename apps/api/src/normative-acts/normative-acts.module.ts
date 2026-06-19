import { Module } from '@nestjs/common';
import { AdminActsController, PublicActsController } from './normative-acts.controller';
import { NormativeActsService } from './normative-acts.service';

@Module({
  controllers: [PublicActsController, AdminActsController],
  providers: [NormativeActsService],
  exports: [NormativeActsService],
})
export class NormativeActsModule {}
