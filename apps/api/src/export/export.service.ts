import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { formatActCode, SITUACAO_LABELS, parseSlug } from '../normative-acts/normative-acts.utils';
import { renderConsolidatedHtml, type ExportAct } from './act-html.renderer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dejavuRoot = path.dirname(require.resolve('dejavu-fonts-ttf/package.json'));
const DEJAVU_SERIF = path.join(dejavuRoot, 'ttf/DejaVuSerif.ttf');
const DEJAVU_BOLD = path.join(dejavuRoot, 'ttf/DejaVuSerif-Bold.ttf');

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async getExportAct(slugPath: string): Promise<ExportAct & { codigo: string }> {
    const parsed = parseSlug(slugPath);
    if (!parsed) throw new NotFoundException('Slug inválido');

    const act = await this.prisma.normativeAct.findFirst({
      where: { slug: slugPath, statusPublicacao: 'publicado' },
      include: {
        units: { orderBy: { ordem: 'asc' } },
        changesAsAlterada: {
          include: { unit: { select: { id: true } } },
        },
      },
    });
    if (!act) throw new NotFoundException('Ato normativo não encontrado');

    const notesByUnit = new Map(
      act.changesAsAlterada
        .filter((c) => c.unitId)
        .map((c) => [c.unitId!, c.notaGerada]),
    );

    return {
      tipo: act.tipo,
      numero: act.numero,
      ano: act.ano,
      ementa: act.ementa,
      situacao: act.situacao,
      assunto: act.assunto,
      orgaoOrigem: act.orgaoOrigem,
      dataAto: act.dataAto,
      dataPublicacao: act.dataPublicacao,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      units: act.units.map((u) => ({
        tipoUnidade: u.tipoUnidade,
        identificacao: u.identificacao,
        texto: u.texto,
        ordem: u.ordem,
        status: u.status,
        nota: notesByUnit.get(u.id) ?? null,
      })),
    };
  }

  async exportHtml(slugPath: string): Promise<{ html: string; filename: string }> {
    const act = await this.getExportAct(slugPath);
    const html = renderConsolidatedHtml(act);
    const filename = `${act.codigo.replace(/\s+/g, '-').replace(/\//g, '-')}-consolidado.html`;
    return { html, filename };
  }

  async exportPdf(slugPath: string): Promise<{ buffer: Buffer; filename: string }> {
    const act = await this.getExportAct(slugPath);
    const buffer = await this.renderPdf(act);
    const filename = `${act.codigo.replace(/\s+/g, '-').replace(/\//g, '-')}-consolidado.pdf`;
    return { buffer, filename };
  }

  private renderPdf(act: ExportAct & { codigo: string }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 56, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('serif', DEJAVU_SERIF);
      doc.registerFont('serif-bold', DEJAVU_BOLD);

      doc.font('serif-bold').fontSize(11).fillColor('#0066CC').text(act.codigo, { continued: true });
      doc.font('serif').fontSize(10).fillColor('#5B6B82').text(`  ·  ${SITUACAO_LABELS[act.situacao]}`);
      doc.moveDown(0.5);
      doc.font('serif-bold').fontSize(14).fillColor('#0F1B2D').text(act.ementa, { align: 'left' });
      doc.moveDown(0.5);
      doc.font('serif').fontSize(9).fillColor('#647389');
      const meta = [
        act.dataPublicacao ? `Publicação: ${act.dataPublicacao.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : null,
        act.orgaoOrigem ? `Órgão: ${act.orgaoOrigem}` : null,
        act.assunto ? `Assunto: ${act.assunto}` : null,
      ].filter(Boolean);
      if (meta.length) doc.text(meta.join('  ·  '));
      doc.moveDown(1);
      doc.font('serif-bold').fontSize(9).fillColor('#97A3B6').text('TEXTO CONSOLIDADO', { characterSpacing: 1 });
      doc.moveDown(0.75);

      for (const unit of act.units) {
        this.writePdfUnit(doc, unit);
      }

      doc.moveDown(1);
      doc.font('serif').fontSize(8).fillColor('#97A3B6').text(
        `Exportado em ${new Date().toLocaleString('pt-BR')} · LeisMunicipais — Prefeitura de Franca/SP`,
        { align: 'center' },
      );

      doc.end();
    });
  }

  private writePdfUnit(doc: InstanceType<typeof PDFDocument>, unit: ExportAct['units'][number]) {
    const isStructural = ['titulo', 'capitulo', 'livro', 'secao', 'subsecao'].includes(unit.tipoUnidade);
    const isPreamble = unit.tipoUnidade === 'preambulo';
    const isRevoked = unit.status === 'revogada';

    if (isPreamble) {
      doc.font('serif').fontSize(11).fillColor('#36465B').text(unit.texto, { align: 'center' });
      doc.moveDown(0.75);
      return;
    }

    if (isStructural) {
      doc.font('serif-bold').fontSize(11).fillColor('#0F1B2D');
      if (unit.identificacao) doc.text(unit.identificacao, { align: 'center' });
      doc.text(unit.texto, { align: 'center' });
      doc.moveDown(0.75);
      return;
    }

    if (unit.tipoUnidade === 'artigo') {
      const prefix = unit.identificacao ? `${unit.identificacao} ` : '';
      doc.font('serif-bold').fontSize(11).fillColor(isRevoked ? '#97A3B6' : '#0F1B2D');
      if (isRevoked) {
        doc.text(prefix + unit.texto, { strike: true, lineGap: 4 });
      } else {
        doc.text(prefix, { continued: true });
        doc.font('serif').text(unit.texto, { lineGap: 4 });
      }
    } else {
      doc.font('serif').fontSize(11).fillColor('#0F1B2D').text(unit.texto, { indent: 24, lineGap: 3 });
    }

    if (unit.nota) {
      doc.moveDown(0.2);
      doc.font('serif').fontSize(9).fillColor('#B5680A').text(unit.nota, { indent: 12 });
    }
    doc.moveDown(0.5);
  }
}
