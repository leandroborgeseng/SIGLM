import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const MIN_PDF_TEXT_CHARS = 80;

/** Remove marcadores de paginação gerados pelo pdf-parse v2. */
function cleanPdfText(raw: string): string {
  return raw
    .replace(/\n--\s*\d+\s+of\s+\d+\s+--\n?/gi, '\n')
    .replace(/\f/g, '\n')
    .trim();
}

@Injectable()
export class TextExtractService {
  async extractDocx(filePath: string): Promise<{ text: string; lib: string; pages: number }> {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim(), lib: 'mammoth.js', pages: 1 };
  }

  async docxToHtml(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.convertToHtml({ buffer });
    return result.value;
  }

  async extractPdf(filePath: string): Promise<{
    text: string;
    lib: string;
    pages: number;
    needsOcr: boolean;
  }> {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      const text = cleanPdfText(result.text ?? '');
      const needsOcr = text.length < MIN_PDF_TEXT_CHARS;
      return {
        text,
        lib: needsOcr ? 'tesseract.js' : 'pdf-parse',
        pages: result.total ?? 1,
        needsOcr,
      };
    } finally {
      await parser.destroy();
    }
  }
}
