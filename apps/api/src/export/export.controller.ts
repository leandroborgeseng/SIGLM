import * as path from 'path';
import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/auth.constants';
import {
  pathExists,
  resolveAttachmentAbsolutePath,
} from '../common/attachment-storage';
import {
  sendAttachmentUnavailable,
  setUserFileHeaders,
} from '../common/file-response';
import { PrismaService } from '../prisma/prisma.service';
import { slugFromParams } from '../normative-acts/normative-acts.utils';
import { ExportService } from './export.service';

@Controller()
@Public()
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('public/acts/:tipo/:ano/:numero/export.html')
  async exportHtml(
    @Param('tipo') tipo: string,
    @Param('ano') ano: string,
    @Param('numero') numero: string,
    @Res() res: Response,
  ) {
    const slug = slugFromParams(tipo, ano, numero);
    const { html, filename } = await this.exports.exportHtml(slug);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  }

  @Get('public/acts/:tipo/:ano/:numero/export.pdf')
  async exportPdf(
    @Param('tipo') tipo: string,
    @Param('ano') ano: string,
    @Param('numero') numero: string,
    @Res() res: Response,
  ) {
    const slug = slugFromParams(tipo, ano, numero);
    const { buffer, filename } = await this.exports.exportPdf(slug);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('public/attachments/:id/file')
  async attachmentFile(@Param('id') id: string, @Res() res: Response) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id },
      include: { act: { select: { statusPublicacao: true } } },
    });
    if (!attachment || !attachment.ativo || attachment.act.statusPublicacao !== 'publicado') {
      return sendAttachmentUnavailable(
        res,
        'O arquivo não pôde ser localizado ou você não possui autorização para acessá-lo.',
      );
    }
    if (!attachment.url) {
      return sendAttachmentUnavailable(res);
    }

    let importStored: string | null = null;
    if (attachment.url.includes('/api/admin/imports/')) {
      const importId = attachment.url.split('/')[4];
      const imp = await this.prisma.import.findUnique({ where: { id: importId } });
      importStored = imp?.arquivo ?? null;
    }

    let filePath = resolveAttachmentAbsolutePath(attachment.url, importStored);

    if (!(await pathExists(filePath))) {
      // Recuperação: importação estruturada vinculada ao ato.
      const linked = await this.prisma.import.findFirst({
        where: { actId: attachment.actId },
        orderBy: { criadoEm: 'desc' },
      });
      if (linked?.arquivo) {
        const src = resolveAttachmentAbsolutePath(linked.arquivo);
        if (await pathExists(src)) filePath = src;
      }
    }

    if (!(await pathExists(filePath))) {
      return sendAttachmentUnavailable(res);
    }

    setUserFileHeaders(res, attachment.nome);
    return res.sendFile(path.resolve(filePath));
  }
}
