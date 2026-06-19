import { Injectable, Logger } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';

export interface OcrPageResult {
  pagina: number;
  texto: string;
  confianca: {
    linhas: { texto: string; confianca: number }[];
    mediaPagina: number;
  };
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async processPdf(filePath: string): Promise<OcrPageResult[]> {
    const results: OcrPageResult[] = [];
    const worker = await createWorker('por');

    try {
      let pagina = 0;
      const document = await pdf(filePath, { scale: 2 });

      for await (const image of document) {
        pagina++;
        this.logger.log(`OCR página ${pagina}...`);

        const { data } = await worker.recognize(image);
        const pageConfidence = Math.round(data.confidence ?? 0);
        const linhas = (data.text ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((texto) => ({ texto, confianca: pageConfidence }));

        const mediaPagina =
          linhas.length > 0
            ? Math.round(linhas.reduce((s, l) => s + l.confianca, 0) / linhas.length)
            : pageConfidence;

        results.push({
          pagina,
          texto: data.text?.trim() ?? '',
          confianca: { linhas, mediaPagina },
        });
      }
    } finally {
      await worker.terminate();
    }

    if (results.length === 0) {
      throw new Error('Não foi possível extrair páginas do PDF para OCR');
    }

    return results;
  }
}
