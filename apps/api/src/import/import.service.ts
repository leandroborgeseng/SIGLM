import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportFormat, ImportStatus, Prisma, PublicationStatus, UnitType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ATTACHMENTS_DIR } from '../common/uploads';
import { buildActSlug, formatActCode } from '../normative-acts/normative-acts.utils';
import { ActType } from '@prisma/client';
import { OcrService } from './ocr.service';
import { mergeOcrPages, parseStructure } from './structure.parser';
import { TextExtractService } from './text-extract.service';

@Injectable()
export class ImportService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly textExtract: TextExtractService,
    private readonly ocr: OcrService,
  ) {
    void fs.mkdir(this.uploadDir, { recursive: true });
  }

  async upload(file: Express.Multer.File, userId: string) {
    if (!file) throw new BadRequestException('Arquivo obrigatório');

    const ext = path.extname(file.originalname).toLowerCase();
    let formato: ImportFormat;
    if (ext === '.docx') formato = ImportFormat.docx;
    else if (ext === '.pdf') formato = ImportFormat.pdf;
    else throw new BadRequestException('Formato não suportado. Use DOCX ou PDF.');

    const storedName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const storedPath = path.join(this.uploadDir, storedName);
    await fs.writeFile(storedPath, file.buffer);

    const imp = await this.prisma.import.create({
      data: {
        arquivo: storedName,
        formato,
        status: ImportStatus.upload,
        criadoPorId: userId,
      },
    });

    try {
      return await this.processImport(imp.id);
    } catch (err) {
      await this.prisma.import.update({
        where: { id: imp.id },
        data: { status: ImportStatus.erro },
      });
      throw err;
    }
  }

  async processImport(importId: string) {
    const imp = await this.prisma.import.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Importação não encontrada');

    const filePath = path.join(this.uploadDir, imp.arquivo);
    let needsOcr = false;
    let lib = '';
    let text = '';
    let pages = 1;

    if (imp.formato === ImportFormat.docx) {
      const result = await this.textExtract.extractDocx(filePath);
      text = result.text;
      lib = result.lib;
      pages = result.pages;
    } else {
      const result = await this.textExtract.extractPdf(filePath);
      text = result.text;
      lib = result.lib;
      pages = result.pages;
      needsOcr = result.needsOcr;
    }

    if (needsOcr) {
      await this.prisma.import.update({
        where: { id: importId },
        data: { formato: ImportFormat.pdf_ocr, lib: 'tesseract.js' },
      });

      const ocrPages = await this.ocr.processPdf(filePath);
      await this.prisma.ocrResult.deleteMany({ where: { importId } });

      for (const page of ocrPages) {
        await this.prisma.ocrResult.create({
          data: {
            importId,
            pagina: page.pagina,
            texto: page.texto,
            confianca: page.confianca as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return this.getImportDetail(importId);
    }

    const estrutura = parseStructure(text, 96);
    await this.prisma.import.update({
      where: { id: importId },
      data: {
        lib,
        status: ImportStatus.conferencia,
        estruturaDetectada: estrutura as unknown as Prisma.InputJsonValue,
      },
    });

    return this.getImportDetail(importId);
  }

  async reprocessOcr(importId: string) {
    const imp = await this.ensureOcrImport(importId);
    const filePath = path.join(this.uploadDir, imp.arquivo);

    const ocrPages = await this.ocr.processPdf(filePath);
    await this.prisma.ocrResult.deleteMany({ where: { importId } });

    for (const page of ocrPages) {
      await this.prisma.ocrResult.create({
        data: {
          importId,
          pagina: page.pagina,
          texto: page.texto,
          confianca: page.confianca as unknown as Prisma.InputJsonValue,
          revisadoPorId: null,
          revisadoEm: null,
        },
      });
    }

    await this.prisma.import.update({
      where: { id: importId },
      data: { status: ImportStatus.upload, estruturaDetectada: Prisma.JsonNull },
    });

    return this.getImportDetail(importId);
  }

  async updateOcrText(
    importId: string,
    pages: { pagina: number; texto: string }[],
  ) {
    await this.ensureOcrImport(importId);

    for (const p of pages) {
      await this.prisma.ocrResult.updateMany({
        where: { importId, pagina: p.pagina },
        data: { texto: p.texto, revisadoEm: null, revisadoPorId: null },
      });
    }

    return this.getImportDetail(importId);
  }

  async approveOcr(importId: string, userId: string) {
    const imp = await this.ensureOcrImport(importId);
    const ocrResults = await this.prisma.ocrResult.findMany({
      where: { importId },
      orderBy: { pagina: 'asc' },
    });

    if (ocrResults.length === 0) {
      throw new BadRequestException('Nenhum resultado OCR encontrado');
    }

    const pages = ocrResults.map((r) => ({
      pagina: r.pagina,
      texto: r.texto,
      confianca: r.confianca as { linhas: { texto: string; confianca: number }[]; mediaPagina: number },
    }));

    const estrutura = mergeOcrPages(pages);
    estrutura.ocrAprovado = true;

    await this.prisma.$transaction([
      this.prisma.ocrResult.updateMany({
        where: { importId },
        data: { revisadoPorId: userId, revisadoEm: new Date() },
      }),
      this.prisma.import.update({
        where: { id: importId },
        data: {
          status: ImportStatus.conferencia,
          estruturaDetectada: estrutura as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);

    return this.getImportDetail(importId);
  }

  async confirmDraft(
    importId: string,
    meta: {
      tipo?: ActType;
      numero?: number;
      ano?: number;
      ementa?: string;
      orgaoOrigem?: string;
    },
  ) {
    const imp = await this.getImportDetail(importId);

    if (imp.formato === 'pdf_ocr' && !imp.ocrApproved) {
      throw new BadRequestException('OCR deve ser revisado e aprovado antes da conferência');
    }

    if (imp.status !== 'conferencia' || !imp.estruturaDetectada) {
      throw new BadRequestException('Importação não está pronta para conferência');
    }

    const estrutura = imp.estruturaDetectada as {
      blocos: { tag: string; tipo: string; texto: string; ordem: number }[];
    };

    const ementaBlock = estrutura.blocos.find((b) => b.tipo === 'ementa');
    const ementa = meta.ementa ?? ementaBlock?.texto ?? 'Ementa importada';
    const ano = meta.ano ?? new Date().getFullYear();
    const numero = meta.numero ?? (await this.nextNumero(meta.tipo ?? ActType.lei, ano));
    const tipo = meta.tipo ?? ActType.lei;

    const act = await this.prisma.normativeAct.create({
      data: {
        tipo,
        numero,
        ano,
        ementa,
        orgaoOrigem: meta.orgaoOrigem ?? 'Importação',
        slug: buildActSlug(tipo, ano, numero),
        statusPublicacao: PublicationStatus.rascunho,
        units: {
          create: estrutura.blocos.map((b, i) => ({
            tipoUnidade: b.tipo as UnitType,
            identificacao: b.tipo === 'artigo' ? b.tag : b.tipo === 'preambulo' ? null : b.tag,
            texto: b.texto,
            ordem: i,
          })),
        },
      },
      include: { units: true },
    });

    const importRecord = await this.prisma.import.findUnique({ where: { id: importId } });
    if (importRecord) {
      const safeName = imp.arquivoOriginal.replace(/[^\w.-]/g, '_');
      const storedName = `${act.id}-${safeName}`;
      await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
      await fs.copyFile(
        path.join(this.uploadDir, importRecord.arquivo),
        path.join(ATTACHMENTS_DIR, storedName),
      );
      await this.prisma.attachment.create({
        data: {
          actId: act.id,
          tipo: imp.formato === 'pdf_ocr' ? 'digitalizado' : 'pdf_original',
          url: `attachments/${storedName}`,
          nome: imp.arquivoOriginal,
        },
      });
    }

    await this.prisma.import.update({
      where: { id: importId },
      data: { actId: act.id, status: ImportStatus.rascunho },
    });

    return {
      actId: act.id,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      editorUrl: `/admin/atos/${act.id}/editor`,
    };
  }

  async getImportDetail(importId: string) {
    const imp = await this.prisma.import.findUnique({
      where: { id: importId },
      include: {
        ocrResults: { orderBy: { pagina: 'asc' } },
        act: { select: { id: true, slug: true, tipo: true, numero: true, ano: true } },
      },
    });
    if (!imp) throw new NotFoundException('Importação não encontrada');

    const ocrApproved =
      imp.ocrResults.length > 0 && imp.ocrResults.every((r) => r.revisadoEm !== null);

    const lowConfidenceLines = imp.ocrResults.flatMap((r) => {
      const conf = r.confianca as { linhas?: { texto: string; confianca: number }[] };
      return (conf.linhas ?? [])
        .filter((l) => l.confianca < 80)
        .map((l) => ({ pagina: r.pagina, ...l }));
    });

    const mediaOcr =
      imp.ocrResults.length > 0
        ? Math.round(
            imp.ocrResults.reduce((s, r) => {
              const c = r.confianca as { mediaPagina?: number };
              return s + (c.mediaPagina ?? 0);
            }, 0) / imp.ocrResults.length,
          )
        : null;

    return {
      id: imp.id,
      arquivo: imp.arquivo,
      arquivoOriginal: imp.arquivo.replace(/^\d+-/, ''),
      formato: imp.formato,
      lib: imp.lib,
      status: imp.status,
      estruturaDetectada: imp.estruturaDetectada,
      actId: imp.actId,
      act: imp.act
        ? { ...imp.act, codigo: formatActCode(imp.act.tipo, imp.act.numero, imp.act.ano) }
        : null,
      ocrResults: imp.ocrResults.map((r) => ({
        id: r.id,
        pagina: r.pagina,
        texto: r.texto,
        confianca: r.confianca,
        revisado: r.revisadoEm !== null,
      })),
      ocrApproved,
      needsOcrReview: imp.formato === ImportFormat.pdf_ocr && !ocrApproved,
      mediaOcr,
      lowConfidenceLines,
      fileUrl: `/admin/imports/${imp.id}/file`,
      criadoEm: imp.criadoEm,
    };
  }

  async getFilePath(importId: string): Promise<{ path: string; filename: string }> {
    const imp = await this.prisma.import.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Importação não encontrada');
    return {
      path: path.join(this.uploadDir, imp.arquivo),
      filename: imp.arquivo.replace(/^\d+-/, ''),
    };
  }

  private async ensureOcrImport(importId: string) {
    const imp = await this.prisma.import.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Importação não encontrada');
    if (imp.formato !== ImportFormat.pdf_ocr && imp.formato !== ImportFormat.pdf) {
      throw new BadRequestException('Importação não é PDF/OCR');
    }
    return imp;
  }

  private async nextNumero(tipo: ActType, ano: number): Promise<number> {
    const max = await this.prisma.normativeAct.aggregate({
      where: { tipo, ano },
      _max: { numero: true },
    });
    return (max._max.numero ?? 0) + 1;
  }
}
