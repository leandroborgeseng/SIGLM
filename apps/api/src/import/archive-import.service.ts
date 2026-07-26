import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActType,
  ArchiveImportBatchStatus,
  ArchiveImportItemStatus,
  AttachmentType,
  EditorialStage,
  ImportFormat,
  PublicationStatus,
} from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { copyToPermanentAttachmentStorage } from '../common/attachment-storage';
import { PrismaService } from '../prisma/prisma.service';
import { buildActSlug, formatActCode } from '../normative-acts/normative-acts.utils';
import { recordInternalHistory } from '../normative-acts/act-versioning.utils';
import { extractActMetadata } from './metadata.parser';
import { OcrService } from './ocr.service';
import { TextExtractService } from './text-extract.service';

const LOW_CONFIDENCE = 55;

@Injectable()
export class ArchiveImportService {
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'archive');

  constructor(
    private readonly prisma: PrismaService,
    private readonly textExtract: TextExtractService,
    private readonly ocr: OcrService,
  ) {
    void fs.mkdir(this.uploadDir, { recursive: true });
  }

  async uploadBatch(files: Express.Multer.File[], userId: string) {
    if (!files?.length) throw new BadRequestException('Envie ao menos um arquivo');
    if (files.length > 100) {
      throw new BadRequestException('Máximo de 100 arquivos por lote');
    }

    const batch = await this.prisma.archiveImportBatch.create({
      data: {
        status: ArchiveImportBatchStatus.processando,
        criadoPorId: userId,
      },
    });

    const items = [];
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      let formato: ImportFormat;
      if (ext === '.docx') formato = ImportFormat.docx;
      else if (ext === '.pdf') formato = ImportFormat.pdf;
      else {
        items.push(
          await this.prisma.archiveImportItem.create({
            data: {
              batchId: batch.id,
              arquivo: '',
              nomeArquivo: file.originalname,
              formato: ImportFormat.pdf,
              status: ArchiveImportItemStatus.erro,
              erroMensagem: 'Formato não suportado. Use DOCX ou PDF.',
            },
          }),
        );
        continue;
      }

      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await fs.writeFile(path.join(this.uploadDir, storedName), file.buffer);

      items.push(
        await this.prisma.archiveImportItem.create({
          data: {
            batchId: batch.id,
            arquivo: storedName,
            nomeArquivo: file.originalname,
            formato,
            status: ArchiveImportItemStatus.processando,
          },
        }),
      );
    }

    void this.processBatch(batch.id);

    return this.getBatch(batch.id);
  }

  private async processBatch(batchId: string) {
    const items = await this.prisma.archiveImportItem.findMany({
      where: { batchId, status: ArchiveImportItemStatus.processando },
    });

    for (const item of items) {
      try {
        await this.processItem(item.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        await this.prisma.archiveImportItem.update({
          where: { id: item.id },
          data: {
            status: ArchiveImportItemStatus.erro,
            erroMensagem: message.slice(0, 400),
          },
        });
      }
    }

    await this.refreshBatchStatus(batchId);
  }

  private async processItem(itemId: string) {
    const item = await this.prisma.archiveImportItem.findUnique({ where: { id: itemId } });
    if (!item || !item.arquivo) return;

    const filePath = path.join(this.uploadDir, item.arquivo);
    let text = '';
    let usedOcr = false;

    if (item.formato === ImportFormat.docx) {
      const result = await this.textExtract.extractDocx(filePath);
      text = result.text;
    } else {
      const result = await this.textExtract.extractPdf(filePath);
      text = result.text;
      if (result.needsOcr || text.trim().length < 80) {
        // OCR leve: só primeiras páginas para metadados/ementa
        const pages = await this.ocr.processPdf(filePath, { maxPages: 3 });
        text = pages.map((p) => p.texto).join('\n\n');
        usedOcr = true;
      }
    }

    const meta = extractActMetadata(text, item.nomeArquivo);
    const tipo = (meta.tipo as ActType | null) ?? null;
    const numero = meta.numero ?? null;
    const dataAto = meta.dataAto ? new Date(meta.dataAto) : null;
    const ano =
      meta.ano ??
      (dataAto && !Number.isNaN(dataAto.getTime()) ? dataAto.getUTCFullYear() : null);

    let existingActId: string | null = null;
    let status: ArchiveImportItemStatus = ArchiveImportItemStatus.pronto;

    if (tipo && numero != null && ano != null) {
      const existing = await this.prisma.normativeAct.findFirst({
        where: { tipo, numero, ano },
        select: { id: true },
      });
      if (existing) {
        existingActId = existing.id;
        status = ArchiveImportItemStatus.duplicata;
      }
    }

    if (status !== ArchiveImportItemStatus.duplicata && meta.confianca < LOW_CONFIDENCE) {
      status = ArchiveImportItemStatus.baixa_confianca;
    }

    await this.prisma.archiveImportItem.update({
      where: { id: itemId },
      data: {
        status,
        tipo,
        numero,
        ano,
        dataAto: dataAto && !Number.isNaN(dataAto.getTime()) ? dataAto : null,
        ementa: meta.ementa?.slice(0, 8000) ?? null,
        confianca: meta.confianca,
        existingActId,
        formato: usedOcr ? ImportFormat.pdf_ocr : item.formato,
        erroMensagem: null,
      },
    });
  }

  private async refreshBatchStatus(batchId: string) {
    const items = await this.prisma.archiveImportItem.findMany({
      where: { batchId },
      select: { status: true },
    });
    const still = items.some((i) => i.status === ArchiveImportItemStatus.processando);
    if (still) {
      await this.prisma.archiveImportBatch.update({
        where: { id: batchId },
        data: { status: ArchiveImportBatchStatus.processando },
      });
      return;
    }
    const hasError = items.some((i) => i.status === ArchiveImportItemStatus.erro);
    await this.prisma.archiveImportBatch.update({
      where: { id: batchId },
      data: {
        status: hasError
          ? ArchiveImportBatchStatus.erro_parcial
          : ArchiveImportBatchStatus.conferencia,
      },
    });
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.archiveImportBatch.findUnique({
      where: { id: batchId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        criadoPor: { select: { id: true, nome: true, email: true } },
      },
    });
    if (!batch) throw new NotFoundException('Lote de importação não encontrado');

    const existingIds = batch.items
      .map((i) => i.existingActId)
      .filter((id): id is string => Boolean(id));
    const existingActs = existingIds.length
      ? await this.prisma.normativeAct.findMany({
          where: { id: { in: existingIds } },
          select: { id: true, tipo: true, numero: true, ano: true, slug: true, ementa: true },
        })
      : [];
    const existingMap = new Map(existingActs.map((a) => [a.id, a]));

    const counts = {
      total: batch.items.length,
      processando: 0,
      pronto: 0,
      baixa_confianca: 0,
      duplicata: 0,
      erro: 0,
      confirmado: 0,
      ignorado: 0,
      vinculado: 0,
    };
    for (const i of batch.items) {
      counts[i.status] = (counts[i.status] ?? 0) + 1;
    }

    return {
      id: batch.id,
      status: batch.status,
      criadoEm: batch.criadoEm,
      concluidoEm: batch.concluidoEm,
      criadoPor: batch.criadoPor,
      counts,
      items: batch.items.map((i) => {
        const existing = i.existingActId ? existingMap.get(i.existingActId) : null;
        return {
          id: i.id,
          nomeArquivo: i.nomeArquivo,
          formato: i.formato,
          status: i.status,
          tipo: i.tipo,
          numero: i.numero,
          ano: i.ano,
          dataAto: i.dataAto,
          ementa: i.ementa,
          confianca: i.confianca,
          erroMensagem: i.erroMensagem,
          resolucao: i.resolucao,
          actId: i.actId,
          existingAct: existing
            ? {
                id: existing.id,
                codigo: formatActCode(existing.tipo, existing.numero, existing.ano),
                slug: existing.slug,
                ementa: existing.ementa,
              }
            : null,
          fileUrl: i.arquivo ? `/admin/archive-imports/${batch.id}/items/${i.id}/file` : null,
        };
      }),
    };
  }

  async getItemFilePath(batchId: string, itemId: string) {
    const item = await this.prisma.archiveImportItem.findFirst({
      where: { id: itemId, batchId },
    });
    if (!item?.arquivo) throw new NotFoundException('Arquivo não encontrado');
    return {
      path: path.join(this.uploadDir, item.arquivo),
      filename: item.nomeArquivo,
    };
  }

  async updateItem(
    batchId: string,
    itemId: string,
    body: {
      tipo?: ActType | null;
      numero?: number | null;
      ano?: number | null;
      dataAto?: string | null;
      ementa?: string | null;
      resolucao?: 'ignore' | 'link' | 'create' | null;
    },
  ) {
    const item = await this.prisma.archiveImportItem.findFirst({
      where: { id: itemId, batchId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    if (
      item.status === ArchiveImportItemStatus.confirmado ||
      item.status === ArchiveImportItemStatus.ignorado ||
      item.status === ArchiveImportItemStatus.vinculado
    ) {
      throw new BadRequestException('Item já foi processado na confirmação');
    }

    const tipo = body.tipo !== undefined ? body.tipo : item.tipo;
    const numero = body.numero !== undefined ? body.numero : item.numero;
    const dataAto =
      body.dataAto !== undefined
        ? body.dataAto
          ? new Date(body.dataAto)
          : null
        : item.dataAto;
    const ano =
      body.ano !== undefined
        ? body.ano
        : dataAto && !Number.isNaN(dataAto.getTime())
          ? dataAto.getUTCFullYear()
          : item.ano;

    let existingActId = item.existingActId;
    let status: ArchiveImportItemStatus = item.status;

    if (tipo && numero != null && ano != null) {
      const existing = await this.prisma.normativeAct.findFirst({
        where: { tipo, numero, ano },
        select: { id: true },
      });
      if (existing) {
        existingActId = existing.id;
        status = ArchiveImportItemStatus.duplicata;
      } else {
        existingActId = null;
        status =
          (item.confianca ?? 0) < LOW_CONFIDENCE
            ? ArchiveImportItemStatus.baixa_confianca
            : ArchiveImportItemStatus.pronto;
      }
    }

    if (body.resolucao === 'ignore') {
      status = ArchiveImportItemStatus.ignorado;
    }

    await this.prisma.archiveImportItem.update({
      where: { id: itemId },
      data: {
        tipo,
        numero,
        ano,
        dataAto: dataAto && !Number.isNaN(dataAto?.getTime?.() ?? NaN) ? dataAto : null,
        ementa: body.ementa !== undefined ? body.ementa : item.ementa,
        existingActId,
        status,
        resolucao: body.resolucao !== undefined ? body.resolucao : item.resolucao,
      },
    });

    return this.getBatch(batchId);
  }

  async confirmBatch(
    batchId: string,
    userId: string,
    body: { itemIds: string[] },
  ) {
    const batch = await this.prisma.archiveImportBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('Lote não encontrado');

    const ids = body.itemIds?.length
      ? body.itemIds
      : (
          await this.prisma.archiveImportItem.findMany({
            where: {
              batchId,
              status: {
                in: [
                  ArchiveImportItemStatus.pronto,
                  ArchiveImportItemStatus.baixa_confianca,
                  ArchiveImportItemStatus.duplicata,
                ],
              },
            },
            select: { id: true },
          })
        ).map((i) => i.id);

    if (!ids.length) throw new BadRequestException('Nenhum item selecionado');

    const results: {
      itemId: string;
      ok: boolean;
      actId?: string;
      codigo?: string;
      action?: string;
      error?: string;
    }[] = [];

    for (const itemId of ids) {
      try {
        const r = await this.confirmItem(batchId, itemId, userId);
        results.push({ itemId, ok: true, ...r });
      } catch (err) {
        results.push({
          itemId,
          ok: false,
          error: err instanceof Error ? err.message : 'Erro',
        });
      }
    }

    const pending = await this.prisma.archiveImportItem.count({
      where: {
        batchId,
        status: {
          in: [
            ArchiveImportItemStatus.processando,
            ArchiveImportItemStatus.pronto,
            ArchiveImportItemStatus.baixa_confianca,
            ArchiveImportItemStatus.duplicata,
            ArchiveImportItemStatus.erro,
          ],
        },
      },
    });

    if (pending === 0) {
      await this.prisma.archiveImportBatch.update({
        where: { id: batchId },
        data: {
          status: ArchiveImportBatchStatus.concluido,
          concluidoEm: new Date(),
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        acao: 'archive_import.confirm',
        entidade: 'ArchiveImportBatch',
        entidadeId: batchId,
        diff: {
          confirmed: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          acts: results
            .map((r) => r.actId)
            .filter((id): id is string => typeof id === 'string'),
        },
      },
    });

    return { batchId, results, batch: await this.getBatch(batchId) };
  }

  private async confirmItem(batchId: string, itemId: string, userId: string) {
    const item = await this.prisma.archiveImportItem.findFirst({
      where: { id: itemId, batchId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    if (
      item.status === ArchiveImportItemStatus.confirmado ||
      item.status === ArchiveImportItemStatus.vinculado ||
      item.status === ArchiveImportItemStatus.ignorado
    ) {
      return { actId: item.actId ?? undefined, action: item.status };
    }
    if (item.status === ArchiveImportItemStatus.erro || !item.arquivo) {
      throw new BadRequestException(item.erroMensagem || 'Item com erro');
    }

    const resolucao = item.resolucao || (item.status === ArchiveImportItemStatus.duplicata ? null : 'create');

    if (item.status === ArchiveImportItemStatus.duplicata) {
      if (resolucao === 'ignore') {
        await this.prisma.archiveImportItem.update({
          where: { id: itemId },
          data: { status: ArchiveImportItemStatus.ignorado, resolucao: 'ignore' },
        });
        return { action: 'ignorado' };
      }
      if (resolucao === 'link' && item.existingActId) {
        await this.attachOriginalToAct(item.existingActId, item, userId);
        await this.prisma.archiveImportItem.update({
          where: { id: itemId },
          data: {
            status: ArchiveImportItemStatus.vinculado,
            actId: item.existingActId,
            resolucao: 'link',
          },
        });
        return { actId: item.existingActId, action: 'vinculado' };
      }
      if (resolucao !== 'create') {
        throw new BadRequestException(
          'Duplicata: escolha ignorar, vincular ao ato existente ou criar mesmo assim',
        );
      }
    }

    const tipo = item.tipo ?? ActType.lei;
    const dataAto = item.dataAto;
    const ano =
      item.ano ??
      (dataAto && !Number.isNaN(dataAto.getTime())
        ? dataAto.getUTCFullYear()
        : new Date().getFullYear());
    let numero = item.numero;
    if (numero == null) {
      const last = await this.prisma.normativeAct.findFirst({
        where: { tipo, ano },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      numero = (last?.numero ?? 0) + 1;
    }

    // create force even if duplicate exists with different slug path - check again
    const clash = await this.prisma.normativeAct.findFirst({
      where: { tipo, numero, ano },
      select: { id: true },
    });
    if (clash && resolucao !== 'create') {
      throw new BadRequestException('Já existe ato com este tipo, número e ano');
    }
    if (clash && resolucao === 'create') {
      // Forçar criação exige número livre — incrementa
      const last = await this.prisma.normativeAct.findFirst({
        where: { tipo, ano },
        orderBy: { numero: 'desc' },
        select: { numero: true },
      });
      numero = (last?.numero ?? 0) + 1;
    }

    const ementa = item.ementa?.trim() || 'Ementa pendente — importação de acervo';
    const slug = buildActSlug(tipo, ano, numero);

    // Cópia definitiva ANTES de criar o ato — evita cadastro órfão sem arquivo.
    const permanent = await this.copyOriginalToPermanent(item);

    const act = await this.prisma.$transaction(async (tx) => {
      const created = await tx.normativeAct.create({
        data: {
          tipo,
          numero,
          ano,
          ementa,
          dataAto: dataAto ?? undefined,
          slug,
          orgaoOrigem: 'Importação de acervo',
          statusPublicacao: PublicationStatus.rascunho,
          etapaEditorial: EditorialStage.somente_arquivo_original,
        },
      });

      await tx.attachment.updateMany({
        where: {
          actId: created.id,
          tipo: { in: [AttachmentType.pdf_original, AttachmentType.digitalizado] },
          ativo: true,
        },
        data: { ativo: false, substituidoEm: new Date(), tipo: AttachmentType.arquivo_historico },
      });

      await tx.attachment.create({
        data: {
          actId: created.id,
          tipo:
            item.formato === ImportFormat.pdf_ocr
              ? AttachmentType.digitalizado
              : AttachmentType.pdf_original,
          url: permanent.url,
          nome: permanent.nome,
          titulo: 'Arquivo original do ato',
          tamanho: permanent.tamanho,
          hash: permanent.hash,
        },
      });

      await tx.archiveImportItem.update({
        where: { id: itemId },
        data: {
          status: ArchiveImportItemStatus.confirmado,
          actId: created.id,
          resolucao: resolucao || 'create',
          numero,
          ano,
          tipo,
        },
      });

      return created;
    });

    await recordInternalHistory(this.prisma, {
      actId: act.id,
      userId,
      acao: 'importacao_acervo',
      resumo: `Criou ato via Importação de acervo (arquivo: ${item.nomeArquivo})`,
      withSnapshot: false,
    });

    return {
      actId: act.id,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      action: 'criado',
    };
  }

  private async copyOriginalToPermanent(item: {
    id?: string;
    arquivo: string;
    nomeArquivo: string;
  }) {
    const src = path.join(this.uploadDir, item.arquivo);
    const storageKey = item.id ?? `acervo-${Date.now()}`;
    try {
      return await copyToPermanentAttachmentStorage(src, storageKey, item.nomeArquivo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'falha ao copiar';
      throw new BadRequestException(
        `Não foi possível transferir o arquivo original para o armazenamento definitivo (${msg})`,
      );
    }
  }

  private async linkPermanentOriginal(
    actId: string,
    item: { nomeArquivo: string; formato: ImportFormat },
    permanent: { url: string; nome: string; tamanho: number; hash: string },
    userId: string,
  ) {
    await this.prisma.attachment.updateMany({
      where: {
        actId,
        tipo: { in: [AttachmentType.pdf_original, AttachmentType.digitalizado] },
        ativo: true,
      },
      data: { ativo: false, substituidoEm: new Date(), tipo: AttachmentType.arquivo_historico },
    });

    await this.prisma.attachment.create({
      data: {
        actId,
        tipo:
          item.formato === ImportFormat.pdf_ocr
            ? AttachmentType.digitalizado
            : AttachmentType.pdf_original,
        url: permanent.url,
        nome: permanent.nome,
        titulo: 'Arquivo original do ato',
        tamanho: permanent.tamanho,
        hash: permanent.hash,
      },
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'anexo_original_acervo',
      resumo: `Vinculou arquivo original (${item.nomeArquivo}) via Importação de acervo`,
      withSnapshot: false,
    });
  }

  private async attachOriginalToAct(
    actId: string,
    item: { id?: string; arquivo: string; nomeArquivo: string; formato: ImportFormat },
    userId: string,
  ) {
    const permanent = await this.copyOriginalToPermanent(item);
    await this.linkPermanentOriginal(actId, item, permanent, userId);
  }
}