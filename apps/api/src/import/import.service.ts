import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ImportFormat, ImportStatus, Prisma, PublicationStatus, UnitType, EffectType, InclusaoPosicionamento, ActType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ATTACHMENTS_DIR } from '../common/uploads';
import { buildActSlug, formatActCode } from '../normative-acts/normative-acts.utils';
import { OcrService } from './ocr.service';
import { mergeOcrPages, parseStructure } from './structure.parser';
import { parseLegislativeEffects, type SuggestedLegislativeEffect } from './effects.parser';
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
        status: ImportStatus.processando,
        criadoPorId: userId,
      },
    });

    void this.runProcessImport(imp.id);

    return this.getImportDetail(imp.id);
  }

  private async runProcessImport(importId: string) {
    try {
      await this.processImport(importId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error(`[import] falhou ${importId}:`, err);
      await this.prisma.import.update({
        where: { id: importId },
        data: {
          status: ImportStatus.erro,
          lib: `erro: ${message.slice(0, 240)}`,
        },
      });
    }
  }

  async processImport(importId: string) {
    await this.prisma.import.update({
      where: { id: importId },
      data: { status: ImportStatus.processando },
    });
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
      await this.saveOcrResults(importId, ocrPages);

      await this.prisma.import.update({
        where: { id: importId },
        data: { status: ImportStatus.upload },
      });

      return this.getImportDetail(importId);
    }

    const arquivoOriginal = imp.arquivo.replace(/^\d+-/, '');
    const estrutura = this.enrichWithEffects(parseStructure(text, 96, arquivoOriginal));
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

  async reprocessImport(importId: string) {
    const imp = await this.prisma.import.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Importação não encontrada');
    if (imp.actId) throw new BadRequestException('Importação já confirmada');

    await this.prisma.import.update({
      where: { id: importId },
      data: {
        status: ImportStatus.processando,
        estruturaDetectada: Prisma.JsonNull,
        formato: imp.formato === ImportFormat.pdf_ocr ? ImportFormat.pdf : imp.formato,
        lib: null,
      },
    });

    await this.prisma.ocrResult.deleteMany({ where: { importId } });

    void this.runProcessImport(importId);
    return this.getImportDetail(importId);
  }

  async reprocessOcr(importId: string) {
    const imp = await this.ensureOcrImport(importId);
    const filePath = path.join(this.uploadDir, imp.arquivo);

    try {
      await fs.access(filePath);
    } catch {
      throw new BadRequestException(
        'Arquivo da importação não encontrado no servidor. Faça upload novamente.',
      );
    }

    await this.prisma.import.update({
      where: { id: importId },
      data: {
        status: ImportStatus.processando,
        estruturaDetectada: Prisma.JsonNull,
        lib: 'tesseract.js',
      },
    });
    await this.prisma.ocrResult.deleteMany({ where: { importId } });

    void this.runReprocessOcr(importId, filePath);

    return this.getImportDetail(importId);
  }

  private async runReprocessOcr(importId: string, filePath: string) {
    try {
      const ocrPages = await this.ocr.processPdf(filePath);
      await this.saveOcrResults(importId, ocrPages);
      await this.prisma.import.update({
        where: { id: importId },
        data: { status: ImportStatus.upload, formato: ImportFormat.pdf_ocr },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error(`[import] OCR falhou ${importId}:`, err);
      await this.prisma.import.update({
        where: { id: importId },
        data: {
          status: ImportStatus.erro,
          lib: `erro: ${message.slice(0, 240)}`,
        },
      });
    }
  }

  private async saveOcrResults(
    importId: string,
    ocrPages: Awaited<ReturnType<OcrService['processPdf']>>,
  ) {
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

    const arquivoOriginal = imp.arquivo.replace(/^\d+-/, '');
    const estrutura = this.enrichWithEffects(mergeOcrPages(pages, arquivoOriginal));
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
      efeitosAceitos?: string[];
    },
  ) {
    const imp = await this.getImportDetail(importId);

    if (imp.formato === 'pdf_ocr' && !imp.ocrApproved) {
      throw new BadRequestException('OCR deve ser revisado e aprovado antes da conferência');
    }

    if (imp.status !== 'conferencia' || !imp.estruturaDetectada) {
      throw new BadRequestException('Importação não está pronta para conferência');
    }

    const estrutura = imp.estruturaDetectada as unknown as {
      blocos: {
        tag: string;
        tipo: string;
        texto: string;
        ordem: number;
        parentOrdem?: number | null;
      }[];
      metadados?: {
        tipo?: string | null;
        numero?: number | null;
        ano?: number | null;
        ementa?: string | null;
      };
      efeitosSugeridos?: SuggestedLegislativeEffect[];
    };

    const ementaBlock = estrutura.blocos.find((b) => b.tipo === 'ementa');
    const detected = estrutura.metadados;
    const ementa =
      meta.ementa ?? detected?.ementa ?? ementaBlock?.texto ?? 'Ementa importada';
    const ano = meta.ano ?? detected?.ano ?? new Date().getFullYear();
    const tipo = (meta.tipo ?? detected?.tipo ?? ActType.lei) as ActType;
    const numero =
      meta.numero ?? detected?.numero ?? (await this.nextNumero(tipo, ano));

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
            identificacao:
              [
                'artigo',
                'paragrafo_unico',
                'paragrafo',
                'inciso',
                'alinea',
                'item',
                'titulo',
                'subtitulo',
                'capitulo',
                'subcapitulo',
                'secao',
                'subsecao',
                'parte',
                'livro',
                'anexo',
              ].includes(b.tipo)
                ? b.tag
                : b.tipo === 'preambulo'
                  ? null
                  : b.tag,
            texto: b.texto,
            ordem: i,
          })),
        },
      },
      include: { units: { orderBy: { ordem: 'asc' } } },
    });

    const ordemToId = new Map(act.units.map((u) => [u.ordem, u.id]));
    for (const block of estrutura.blocos) {
      if (block.parentOrdem == null) continue;
      const unitId = ordemToId.get(block.ordem);
      const parentId = ordemToId.get(block.parentOrdem);
      if (unitId && parentId) {
        await this.prisma.normativeUnit.update({
          where: { id: unitId },
          data: { parentUnitId: parentId },
        });
      }
    }

    await this.createEffectsFromImport(
      act,
      ordemToId,
      estrutura.efeitosSugeridos ?? [],
      meta.efeitosAceitos,
    );

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

  async getDocxPreviewHtml(importId: string): Promise<string> {
    const imp = await this.prisma.import.findUnique({ where: { id: importId } });
    if (!imp) throw new NotFoundException('Importação não encontrada');
    if (imp.formato !== ImportFormat.docx) {
      throw new BadRequestException('Preview HTML disponível apenas para DOCX');
    }
    const filePath = path.join(this.uploadDir, imp.arquivo);
    return this.textExtract.docxToHtml(filePath);
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

  private enrichWithEffects<T extends { blocos: { ordem: number; tag: string; tipo: string; texto: string; confianca: number }[] }>(
    estrutura: T,
  ): T & { efeitosSugeridos: SuggestedLegislativeEffect[] } {
    const efeitosSugeridos = parseLegislativeEffects(estrutura.blocos);
    return { ...estrutura, efeitosSugeridos };
  }

  private normalizeIdentificacao(id: string | null | undefined): string {
    if (!id) return '';
    return id
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .replace(/[°ºoO.]/g, '')
      .replace(/^art(?:igo)?\.?\s*/, 'art ')
      .replace(/^§\s*/, 'par ')
      .replace(/^paragrafo\s+unico/, 'paragrafo unico')
      .replace(/^capitulo\s+/, 'cap ')
      .trim();
  }

  private findUnitByIdent(
    units: { id: string; identificacao: string | null }[],
    ident: string | null,
  ) {
    if (!ident) return null;
    const norm = this.normalizeIdentificacao(ident);
    const exact = units.find((u) => this.normalizeIdentificacao(u.identificacao) === norm);
    if (exact) return exact;
    return (
      units.find((u) => {
        const uNorm = this.normalizeIdentificacao(u.identificacao);
        return uNorm.length > 0 && (uNorm.includes(norm) || norm.includes(uNorm));
      }) ?? null
    );
  }

  private inferInclusionType(ident: string | null | undefined): UnitType {
    if (!ident) return UnitType.artigo;
    const u = ident.toUpperCase();
    if (/CAP[ÍI]TULO/.test(u)) return UnitType.capitulo;
    if (/T[ÍI]TULO/.test(u)) return UnitType.titulo;
    if (/SE[ÇC][ÃA]O/.test(u)) return UnitType.secao;
    if (/PAR[ÁA]GRAFO\s+[ÚU]NICO|§/.test(u)) return UnitType.paragrafo;
    if (/INCISO/.test(u) || /^[IVXLCDM]+$/.test(ident.trim())) return UnitType.inciso;
    return UnitType.artigo;
  }

  private async createEffectsFromImport(
    act: { id: string; units: { id: string; ordem: number; identificacao: string | null }[] },
    ordemToId: Map<number, string>,
    sugeridos: SuggestedLegislativeEffect[],
    aceitosIds?: string[],
  ) {
    const toApply =
      aceitosIds && aceitosIds.length > 0
        ? sugeridos.filter((e) => aceitosIds.includes(e.id))
        : sugeridos.filter((e) => e.aceito);

    if (toApply.length === 0) return;

    for (let ordem = 0; ordem < toApply.length; ordem++) {
      const effect = toApply[ordem];
      if (!effect.normaTipo || !effect.normaNumero || !effect.normaAno) continue;

      const normaAlterada = await this.prisma.normativeAct.findFirst({
        where: {
          tipo: effect.normaTipo as ActType,
          numero: effect.normaNumero,
          ano: effect.normaAno,
        },
        include: { units: { orderBy: { ordem: 'asc' } } },
      });
      if (!normaAlterada) continue;

      const sourceUnitId = ordemToId.get(effect.sourceBlockOrdem);
      if (!sourceUnitId) continue;

      const targetUnit = this.findUnitByIdent(normaAlterada.units, effect.targetIdentificacao);
      const referenciaUnit = this.findUnitByIdent(
        normaAlterada.units,
        effect.referenciaIdentificacao ?? effect.targetIdentificacao,
      );

      await this.prisma.legislativeEffect.create({
        data: {
          sourceUnitId,
          normaAlteradaActId: normaAlterada.id,
          targetUnitId: targetUnit?.id ?? null,
          tipoEfeito: effect.tipoEfeito as EffectType,
          dataVigencia: new Date(),
          tipoDispositivoIncluido:
            effect.tipoEfeito === 'inclusao'
              ? this.inferInclusionType(effect.novaIdentificacao)
              : null,
          posicionamento: effect.posicionamento as InclusaoPosicionamento | null,
          referenciaUnitId: referenciaUnit?.id ?? targetUnit?.id ?? null,
          textoNovo: effect.textoNovo,
          novaIdentificacao: effect.novaIdentificacao,
          observacoes: `Detectado na importação (${effect.confianca}% confiança)`,
          ordem,
        },
      });
    }
  }

  private async nextNumero(tipo: ActType, ano: number): Promise<number> {
    const max = await this.prisma.normativeAct.aggregate({
      where: { tipo, ano },
      _max: { numero: true },
    });
    return (max._max.numero ?? 0) + 1;
  }
}
