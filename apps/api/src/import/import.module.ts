import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { OcrService } from './ocr.service';
import { TextExtractService } from './text-extract.service';

@Module({
  controllers: [ImportController],
  providers: [ImportService, TextExtractService, OcrService],
})
export class ImportModule {}
