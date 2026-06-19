import * as path from 'path';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs/promises';
import { Public } from '../auth/auth.constants';
import { resolveUploadPath } from '../common/uploads';
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
    if (!attachment || attachment.act.statusPublicacao !== 'publicado') {
      throw new NotFoundException('Anexo não encontrado');
    }

    let filePath = resolveUploadPath(attachment.url);

    if (attachment.url.includes('/api/admin/imports/')) {
      const importId = attachment.url.split('/')[4];
      const imp = await this.prisma.import.findUnique({ where: { id: importId } });
      if (imp) filePath = resolveUploadPath(imp.arquivo);
    }

    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Arquivo não disponível');
    }

    const safeFilename = attachment.nome.replace(/[^\w.\-() ]/g, '_');
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    res.sendFile(path.resolve(filePath));
  }
}
