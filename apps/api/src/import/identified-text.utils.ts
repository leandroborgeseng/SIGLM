import { IdentifiedTextOrigin, ImportFormat } from '@prisma/client';
import type { OcrService } from './ocr.service';
import type { TextExtractService } from './text-extract.service';

export function normalizeIdentifiedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface IdentifiedTextResult {
  text: string | null;
  origem: IdentifiedTextOrigin | null;
  usedOcr: boolean;
}

export async function extractIdentifiedText(
  filePath: string,
  formato: ImportFormat,
  textExtract: TextExtractService,
  ocr: OcrService,
): Promise<IdentifiedTextResult> {
  try {
    if (formato === ImportFormat.docx) {
      const result = await textExtract.extractDocx(filePath);
      const text = normalizeIdentifiedText(result.text);
      if (!text) return { text: null, origem: null, usedOcr: false };
      return { text, origem: IdentifiedTextOrigin.docx, usedOcr: false };
    }

    const result = await textExtract.extractPdf(filePath);
    if (!result.needsOcr && result.text.trim().length >= 80) {
      const text = normalizeIdentifiedText(result.text);
      if (!text) return { text: null, origem: null, usedOcr: false };
      return { text, origem: IdentifiedTextOrigin.pdf_text, usedOcr: false };
    }

    const pages = await ocr.processPdf(filePath);
    const text = normalizeIdentifiedText(pages.map((p) => p.texto).join('\n\n'));
    if (!text) return { text: null, origem: null, usedOcr: true };
    return { text, origem: IdentifiedTextOrigin.ocr, usedOcr: true };
  } catch {
    return { text: null, origem: null, usedOcr: false };
  }
}

export function identifiedTextOriginLabel(origem: IdentifiedTextOrigin | null | undefined): string {
  switch (origem) {
    case IdentifiedTextOrigin.pdf_text:
      return 'Extração direta do PDF';
    case IdentifiedTextOrigin.docx:
      return 'Extração do Word (DOCX)';
    case IdentifiedTextOrigin.ocr:
      return 'Reconhecimento óptico (OCR)';
    default:
      return 'Origem desconhecida';
  }
}
