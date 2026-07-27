import { Module } from '@nestjs/common';
import { ArchiveImportController } from './archive-import.controller';
import { ArchiveImportService } from './archive-import.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { OcrService } from './ocr.service';
import { TextExtractService } from './text-extract.service';

@Module({
  controllers: [ImportController, ArchiveImportController],
  providers: [ImportService, ArchiveImportService, TextExtractService, OcrService],
  exports: [TextExtractService, OcrService],
})
export class ImportModule {}
