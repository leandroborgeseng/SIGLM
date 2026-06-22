import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';
import * as fs from 'fs/promises';
import * as path from 'path';

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
  private readonly cachePath = path.join(process.cwd(), '.tesseract-cache');

  async processPdf(filePath: string): Promise<OcrPageResult[]> {
    try {
      await fs.access(filePath);
    } catch {
      throw new BadRequestException(
        'Arquivo PDF não encontrado no servidor. Faça upload novamente.',
      );
    }

    await fs.mkdir(this.cachePath, { recursive: true });

    const results: OcrPageResult[] = [];
    const worker = await createWorker('por', 1, {
      cachePath: this.cachePath,
      logger: (m) => {
        if (m.status === 'recognizing text') return;
        this.logger.log(`tesseract: ${m.status}${m.progress ? ` ${Math.round(m.progress * 100)}%` : ''}`);
      },
    });

    let document: Awaited<ReturnType<typeof pdf>> | null = null;

    try {
      document = await pdf(filePath, { scale: 2 });
      let pagina = 0;

      for await (const image of document) {
        pagina++;
        this.logger.log(`OCR página ${pagina}/${document.length}...`);

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
      if (document && !document.isDestroyed) {
        await document.destroy();
      }
    }

    if (results.length === 0) {
      throw new BadRequestException('Não foi possível extrair páginas do PDF para OCR');
    }

    return results;
  }
}
