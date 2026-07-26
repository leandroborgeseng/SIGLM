import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentType, Prisma, PublicationStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  copyToPermanentAttachmentStorage,
  isTemporaryOrLegacyAttachmentUrl,
  pathExists,
  resolveAttachmentAbsolutePath,
  safeStoredFilename,
} from '../common/attachment-storage';
import { ATTACHMENTS_DIR } from '../common/uploads';
import { PrismaService } from '../prisma/prisma.service';
import { recordInternalHistory } from '../normative-acts/act-versioning.utils';
import { sanitizeHref } from '../common/rich-text.utils';

const ORIGINAL_TYPES: AttachmentType[] = [
  AttachmentType.pdf_original,
  AttachmentType.digitalizado,
];

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async ensureAct(actId: string) {
    const act = await this.prisma.normativeAct.findUnique({ where: { id: actId } });
    if (!act) throw new NotFoundException('Ato normativo não encontrado');
    return act;
  }

  private assertEditable(act: { statusPublicacao: PublicationStatus; editionOpen: boolean }) {
    if (act.statusPublicacao === PublicationStatus.publicado && !act.editionOpen) {
      throw new BadRequestException(
        'Ato publicado — crie uma nova versão para alterar anexos',
      );
    }
  }

  mapAttachment(a: {
    id: string;
    actId: string;
    tipo: AttachmentType;
    url: string;
    nome: string;
    titulo: string | null;
    href: string | null;
    ordem: number;
    ativo: boolean;
    tamanho: number | null;
    criadoEm: Date;
    substituidoEm: Date | null;
  }) {
    const isFile = Boolean(a.url);
    return {
      id: a.id,
      actId: a.actId,
      tipo: a.tipo,
      url: a.url,
      nome: a.nome,
      titulo: a.titulo ?? a.nome,
      href: a.href,
      ordem: a.ordem,
      ativo: a.ativo,
      tamanho: a.tamanho,
      criadoEm: a.criadoEm.toISOString(),
      substituidoEm: a.substituidoEm?.toISOString() ?? null,
      isFile,
      downloadUrl: isFile ? `/public/attachments/${a.id}/file` : null,
      adminDownloadUrl: isFile ? `/admin/acts/${a.actId}/attachments/${a.id}/file` : null,
      directLink: isFile ? `/public/attachments/${a.id}/file` : a.href,
    };
  }

  async listForAct(actId: string) {
    await this.ensureAct(actId);
    const items = await this.prisma.attachment.findMany({
      where: { actId },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
    });
    const mapped = items.map((a) => this.mapAttachment(a));
    return {
      original: mapped.find(
        (a) => a.ativo && ORIGINAL_TYPES.includes(a.tipo as AttachmentType),
      ) ?? null,
      publicacao:
        mapped.find((a) => a.ativo && a.tipo === AttachmentType.arquivo_publicacao) ?? null,
      topo: mapped.filter((a) => a.ativo && a.tipo === AttachmentType.anexo_topo),
      final: mapped.filter((a) => a.ativo && a.tipo === AttachmentType.anexo_final),
      historico: mapped.filter((a) => a.tipo === AttachmentType.arquivo_historico || !a.ativo),
      all: mapped,
    };
  }

  private async storeFile(actId: string, file: Express.Multer.File) {
    await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
    const safe = safeStoredFilename(file.originalname);
    const storedName = `${actId}-${Date.now()}-${safe}`;
    const fullPath = path.join(ATTACHMENTS_DIR, storedName);
    await fs.writeFile(fullPath, file.buffer);
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    return {
      url: `attachments/${storedName}`,
      nome: file.originalname,
      tamanho: file.size,
      hash,
    };
  }

  /**
   * Localiza o ficheiro físico pelo id estável do anexo.
   * Se a referência estiver quebrada/temporária e o ficheiro ainda existir
   * (ex.: Import.arquivo), recopia para o armazenamento definitivo e atualiza o vínculo.
   */
  async resolveAttachmentFile(actId: string, attachmentId: string) {
    const item = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, actId },
    });
    if (!item || !item.url) {
      this.logger.warn(
        `Anexo sem referência: actId=${actId} attachmentId=${attachmentId}`,
      );
      throw new NotFoundException('Referência de arquivo inválida ou inexistente');
    }

    let importStored: string | null = null;
    if (item.url.includes('/api/admin/imports/')) {
      const importId = item.url.split('/')[4];
      const imp = await this.prisma.import.findUnique({ where: { id: importId } });
      importStored = imp?.arquivo ?? null;
    }

    let absolutePath = resolveAttachmentAbsolutePath(item.url, importStored);
    if (await pathExists(absolutePath)) {
      if (isTemporaryOrLegacyAttachmentUrl(item.url)) {
        const repaired = await this.promoteToPermanent(item, absolutePath);
        return repaired;
      }
      return { absolutePath, nome: item.nome, url: item.url, repaired: false };
    }

    // Tentativa de recuperação a partir da importação estruturada vinculada ao ato.
    const linkedImport = await this.prisma.import.findFirst({
      where: { actId },
      orderBy: { criadoEm: 'desc' },
    });
    if (linkedImport?.arquivo) {
      const src = resolveAttachmentAbsolutePath(linkedImport.arquivo);
      if (await pathExists(src)) {
        this.logger.warn(
          `Recuperando anexo ${item.id} a partir da importação ${linkedImport.id}`,
        );
        return this.promoteToPermanent(item, src);
      }
    }

    // Importação de acervo (arquivos em uploads/archive/).
    const archiveItem = await this.prisma.archiveImportItem.findFirst({
      where: { OR: [{ actId }, { existingActId: actId }] },
      orderBy: { createdAt: 'desc' },
    });
    if (archiveItem?.arquivo) {
      const src = path.join(
        path.dirname(ATTACHMENTS_DIR),
        'archive',
        archiveItem.arquivo,
      );
      if (await pathExists(src)) {
        this.logger.warn(
          `Recuperando anexo ${item.id} a partir do acervo ${archiveItem.id}`,
        );
        return this.promoteToPermanent(item, src);
      }
    }

    this.logger.error(
      `Arquivo inexistente no armazenamento: attachmentId=${item.id} url=${item.url} path=${absolutePath}`,
    );
    throw new NotFoundException(
      'Arquivo inexistente no armazenamento. Verifique o vínculo ou substitua o documento.',
    );
  }

  private async promoteToPermanent(
    item: { id: string; actId: string; nome: string; url: string },
    sourceAbsolutePath: string,
  ) {
    const stored = await copyToPermanentAttachmentStorage(
      sourceAbsolutePath,
      item.actId,
      item.nome,
    );
    await this.prisma.attachment.update({
      where: { id: item.id },
      data: {
        url: stored.url,
        tamanho: stored.tamanho,
        hash: stored.hash,
      },
    });
    this.logger.log(
      `Anexo ${item.id} promovido para armazenamento definitivo: ${stored.url}`,
    );
    return {
      absolutePath: resolveAttachmentAbsolutePath(stored.url),
      nome: item.nome,
      url: stored.url,
      repaired: true,
    };
  }

  /** Verifica e repara anexos originais com referência quebrada ou temporária. */
  async repairBrokenOriginals() {
    const originals = await this.prisma.attachment.findMany({
      where: {
        ativo: true,
        tipo: { in: ORIGINAL_TYPES },
        url: { not: '' },
      },
      select: {
        id: true,
        actId: true,
        nome: true,
        url: true,
        act: { select: { slug: true, tipo: true, numero: true, ano: true } },
      },
    });

    const report: {
      repaired: { id: string; actId: string; slug: string; newUrl: string }[];
      missing: { id: string; actId: string; slug: string; url: string; motivo: string }[];
      ok: number;
    } = { repaired: [], missing: [], ok: 0 };

    for (const item of originals) {
      try {
        const resolved = await this.resolveAttachmentFile(item.actId, item.id);
        if (resolved.repaired) {
          report.repaired.push({
            id: item.id,
            actId: item.actId,
            slug: item.act.slug,
            newUrl: resolved.url,
          });
        } else {
          report.ok += 1;
        }
      } catch (e) {
        report.missing.push({
          id: item.id,
          actId: item.actId,
          slug: item.act.slug,
          url: item.url,
          motivo: e instanceof Error ? e.message : 'Falha ao localizar arquivo',
        });
      }
    }

    return {
      total: originals.length,
      ...report,
    };
  }

  async uploadOriginal(actId: string, file: Express.Multer.File, userId?: string) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);
    if (!file) throw new BadRequestException('Arquivo obrigatório');

    const stored = await this.storeFile(actId, file);
    const existing = await this.prisma.attachment.findFirst({
      where: { actId, ativo: true, tipo: { in: ORIGINAL_TYPES } },
    });

    if (existing) {
      await this.prisma.attachment.update({
        where: { id: existing.id },
        data: {
          tipo: AttachmentType.arquivo_historico,
          ativo: false,
          substituidoEm: new Date(),
        },
      });
    }

    const created = await this.prisma.attachment.create({
      data: {
        actId,
        tipo: AttachmentType.pdf_original,
        url: stored.url,
        nome: stored.nome,
        titulo: 'Arquivo original do ato',
        tamanho: stored.tamanho,
        hash: stored.hash,
        ordem: 0,
        ativo: true,
      },
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: existing ? 'substituir_arquivo_original' : 'anexar_arquivo_original',
      resumo: existing
        ? `Substituiu arquivo original (${existing.nome} → ${stored.nome})`
        : `Anexou arquivo original (${stored.nome})`,
      withSnapshot: true,
    });

    return this.mapAttachment(created);
  }

  async uploadPublicationFile(actId: string, file: Express.Multer.File, userId?: string) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);
    if (!file) throw new BadRequestException('Arquivo obrigatório');

    const stored = await this.storeFile(actId, file);
    const existing = await this.prisma.attachment.findFirst({
      where: { actId, ativo: true, tipo: AttachmentType.arquivo_publicacao },
    });

    if (existing) {
      await this.prisma.attachment.update({
        where: { id: existing.id },
        data: {
          tipo: AttachmentType.arquivo_historico,
          ativo: false,
          substituidoEm: new Date(),
        },
      });
    }

    const created = await this.prisma.attachment.create({
      data: {
        actId,
        tipo: AttachmentType.arquivo_publicacao,
        url: stored.url,
        nome: stored.nome,
        titulo: 'Arquivo da publicação oficial',
        tamanho: stored.tamanho,
        hash: stored.hash,
        ordem: 0,
        ativo: true,
      },
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: existing ? 'substituir_arquivo_publicacao' : 'anexar_arquivo_publicacao',
      resumo: existing
        ? `Substituiu arquivo de publicação (${existing.nome} → ${stored.nome})`
        : `Anexou arquivo de publicação (${stored.nome})`,
      withSnapshot: true,
    });

    return this.mapAttachment(created);
  }

  async createSupplement(
    actId: string,
    body: {
      secao: 'topo' | 'final';
      titulo: string;
      modo: 'arquivo' | 'hiperlink';
      href?: string;
      ordem?: number;
    },
    file: Express.Multer.File | undefined,
    userId?: string,
  ) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);

    const titulo = body.titulo?.trim();
    if (!titulo) throw new BadRequestException('Informe o texto exibido do item');

    const tipo =
      body.secao === 'topo' ? AttachmentType.anexo_topo : AttachmentType.anexo_final;

    const maxOrdem = await this.prisma.attachment.aggregate({
      where: { actId, tipo, ativo: true },
      _max: { ordem: true },
    });
    const ordem = body.ordem ?? (maxOrdem._max.ordem ?? -1) + 1;

    let url = '';
    let nome = titulo;
    let tamanho: number | null = null;
    let hash: string | null = null;
    let href: string | null = null;

    if (body.modo === 'hiperlink') {
      const safe = body.href ? sanitizeHref(body.href) : null;
      if (!safe) throw new BadRequestException('URL inválida');
      href = safe;
      nome = titulo;
    } else {
      if (!file) throw new BadRequestException('Arquivo obrigatório');
      const stored = await this.storeFile(actId, file);
      url = stored.url;
      nome = stored.nome;
      tamanho = stored.tamanho;
      hash = stored.hash;
    }

    const created = await this.prisma.attachment.create({
      data: {
        actId,
        tipo,
        url,
        nome,
        titulo,
        href,
        ordem,
        ativo: true,
        tamanho,
        hash,
      },
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'criar_suplemento',
      resumo: `Incluiu item (${body.secao}): ${titulo}`,
      withSnapshot: true,
    });

    return this.mapAttachment(created);
  }

  async updateSupplement(
    actId: string,
    attachmentId: string,
    body: {
      titulo?: string;
      href?: string;
      ordem?: number;
    },
    userId?: string,
  ) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);
    const item = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        actId,
        ativo: true,
        tipo: { in: [AttachmentType.anexo_topo, AttachmentType.anexo_final] },
      },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    const href =
      body.href !== undefined
        ? body.href
          ? sanitizeHref(body.href)
          : null
        : undefined;
    if (body.href !== undefined && body.href && !href) {
      throw new BadRequestException('URL inválida');
    }

    const updated = await this.prisma.attachment.update({
      where: { id: item.id },
      data: {
        ...(body.titulo !== undefined && { titulo: body.titulo.trim() }),
        ...(href !== undefined && { href }),
        ...(body.ordem !== undefined && { ordem: body.ordem }),
      },
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'editar_suplemento',
      resumo: `Alterou item: ${updated.titulo ?? updated.nome}`,
      withSnapshot: true,
    });

    return this.mapAttachment(updated);
  }

  async reorderSupplements(
    actId: string,
    secao: 'topo' | 'final',
    orderedIds: string[],
    userId?: string,
  ) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);
    const tipo =
      secao === 'topo' ? AttachmentType.anexo_topo : AttachmentType.anexo_final;

    await this.prisma.$transaction(
      orderedIds.map((id, i) =>
        this.prisma.attachment.updateMany({
          where: { id, actId, tipo, ativo: true },
          data: { ordem: i },
        }),
      ),
    );

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'reordenar_suplementos',
      resumo: `Reordenou itens da seção ${secao}`,
      withSnapshot: true,
    });

    return this.listForAct(actId);
  }

  async removeSupplement(actId: string, attachmentId: string, userId?: string) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);
    const item = await this.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        actId,
        ativo: true,
        tipo: { in: [AttachmentType.anexo_topo, AttachmentType.anexo_final] },
      },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    await this.prisma.attachment.update({
      where: { id: item.id },
      data: { ativo: false, substituidoEm: new Date() },
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'remover_suplemento',
      resumo: `Removeu item: ${item.titulo ?? item.nome}`,
      withSnapshot: true,
    });

    return { ok: true };
  }

  async getFilePath(actId: string, attachmentId: string) {
    const resolved = await this.resolveAttachmentFile(actId, attachmentId);
    return {
      url: resolved.url,
      nome: resolved.nome,
      absolutePath: resolved.absolutePath,
    };
  }
}
