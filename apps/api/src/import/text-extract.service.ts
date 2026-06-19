import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import mammoth from 'mammoth';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

const MIN_PDF_TEXT_CHARS = 80;

@Injectable()
export class TextExtractService {
  async extractDocx(filePath: string): Promise<{ text: string; lib: string; pages: number }> {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value.trim(), lib: 'mammoth.js', pages: 1 };
  }

  async extractPdf(filePath: string): Promise<{
    text: string;
    lib: string;
    pages: number;
    needsOcr: boolean;
  }> {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    const text = (data.text ?? '').trim();
    const needsOcr = text.length < MIN_PDF_TEXT_CHARS;
    return {
      text,
      lib: needsOcr ? 'tesseract.js' : 'pdf-parse',
      pages: data.numpages ?? 1,
      needsOcr,
    };
  }
}
