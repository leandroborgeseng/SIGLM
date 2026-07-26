import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import type { ActSnapshot } from '../normative-acts/act-versioning.utils';
import {
  formatActCode,
  formatFormalTitle,
  resolveTituloPrefixo,
  SITUACAO_LABELS,
  parseSlug,
} from '../normative-acts/normative-acts.utils';
import { renderConsolidatedHtml, sortUnitsForDisplay, unitHtmlToPlainText, type ExportAct } from './act-html.renderer';
import { parseFormatacao } from '../common/rich-text.utils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dejavuRoot = path.dirname(require.resolve('dejavu-fonts-ttf/package.json'));
const DEJAVU_SERIF = path.join(dejavuRoot, 'ttf/DejaVuSerif.ttf');
const DEJAVU_BOLD = path.join(dejavuRoot, 'ttf/DejaVuSerif-Bold.ttf');
const BRASAO_PATH = path.resolve(
  process.cwd(),
  process.cwd().endsWith(`${path.sep}apps${path.sep}api`)
    ? '../web/public/brand/franca-brasao.png'
    : 'apps/web/public/brand/franca-brasao.png',
);

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async getExportAct(slugPath: string): Promise<ExportAct & { codigo: string }> {
    const parsed = parseSlug(slugPath);
    if (!parsed) throw new NotFoundException('Slug inválido');

    const act = await this.prisma.normativeAct.findFirst({
      where: { slug: slugPath, statusPublicacao: 'publicado' },
      include: {
        meioPublicacao: true,
        originOrgs: { orderBy: { ordem: 'asc' }, include: { orgao: true } },
        signatories: { orderBy: { ordem: 'asc' } },
        attachments: {
          where: { ativo: true, tipo: 'arquivo_publicacao' },
          take: 1,
        },
        units: { orderBy: { ordem: 'asc' } },
        changesAsAlterada: {
          include: { unit: { select: { id: true } } },
        },
      },
    });
    if (!act) throw new NotFoundException('Ato normativo não encontrado');

    // Export público deve usar o snapshot quando há versão de trabalho aberta.
    let units = act.units;
    let ementa = act.ementa;
    let situacao = act.situacao;
    let assunto = act.assunto;
    let dataAto = act.dataAto;
    let dataPublicacao = act.dataPublicacao;
    let atoConjunto = act.atoConjunto;
    let prefixoTituloModo = act.prefixoTituloModo;
    let prefixoTitulo = act.prefixoTitulo;
    let orgaosOrigem = act.originOrgs.map((l) => ({
      nome: l.orgao.nome,
      sigla: l.orgao.sigla,
    }));
    let meioPublicacao = act.meioPublicacao
      ? { id: act.meioPublicacao.id, nome: act.meioPublicacao.nome }
      : null;
    let signatarios = act.signatories.map((s) => ({
      nome: s.nome,
      cargo: s.cargo,
      ordem: s.ordem,
    }));
    let arquivoPublicacao: { id: string } | null = act.attachments[0]
      ? { id: act.attachments[0].id }
      : null;

    if (act.editionOpen) {
      const rev = await this.prisma.actPublicRevision.findFirst({
        where: { actId: act.id, isCurrent: true },
      });
      const snap = rev?.snapshot as ActSnapshot | null;
      if (snap) {
        units = (snap.units ?? []).map((u) => ({
          ...u,
          actId: act.id,
          formatacao: u.formatacao ?? null,
          origemActId: null,
          alteradoPorActId: null,
          dataAlteracao: null,
          createdAt: act.createdAt,
          updatedAt: act.updatedAt,
        })) as typeof act.units;
        ementa = snap.metadata.ementa ?? ementa;
        situacao = (snap.metadata.situacao as typeof situacao) ?? situacao;
        assunto = snap.metadata.assunto ?? assunto;
        dataAto = snap.metadata.dataAto ? new Date(snap.metadata.dataAto) : dataAto;
        dataPublicacao = snap.metadata.dataPublicacao
          ? new Date(snap.metadata.dataPublicacao)
          : dataPublicacao;
        atoConjunto = snap.metadata.atoConjunto ?? atoConjunto;
        prefixoTituloModo = snap.metadata.prefixoTituloModo ?? prefixoTituloModo;
        prefixoTitulo = snap.metadata.prefixoTitulo ?? prefixoTitulo;
        if (snap.metadata.orgaoOrigem) {
          orgaosOrigem = snap.metadata.orgaoOrigem
            .split(';')
            .map((n) => n.trim())
            .filter(Boolean)
            .map((nome) => ({ nome, sigla: null as string | null }));
        } else {
          orgaosOrigem = [];
        }
        meioPublicacao =
          snap.metadata.meioPublicacao || snap.metadata.meioPublicacaoId
            ? {
                id: snap.metadata.meioPublicacaoId ?? '',
                nome: snap.metadata.meioPublicacao ?? '',
              }
            : null;
        signatarios = (snap.metadata.signatories ?? []).map((s) => ({
          nome: s.nome,
          cargo: s.cargo,
          ordem: s.ordem,
        }));
        const pub = (snap.attachments ?? []).find(
          (a) => a.ativo && a.tipo === 'arquivo_publicacao',
        );
        arquivoPublicacao = pub ? { id: pub.id } : null;
      } else {
        units = [];
        arquivoPublicacao = null;
      }
    }

    const notesByUnit = new Map(
      act.changesAsAlterada
        .filter((c) => c.unitId)
        .map((c) => [c.unitId!, c.notaGerada]),
    );

    return {
      tipo: act.tipo,
      numero: act.numero,
      ano: act.ano,
      ementa,
      situacao,
      assunto,
      orgaoOrigem: orgaosOrigem.map((o) => o.nome).join('; ') || act.orgaoOrigem,
      dataAto,
      dataPublicacao,
      atoConjunto,
      prefixoTituloModo,
      prefixoTitulo,
      orgaosOrigem,
      meioPublicacao,
      arquivoPublicacaoUrl: arquivoPublicacao
        ? `/public/attachments/${arquivoPublicacao.id}/file`
        : null,
      signatarios,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      units: units.map((u) => ({
        tipoUnidade: u.tipoUnidade,
        identificacao: u.identificacao,
        texto: u.texto,
        formatacao: parseFormatacao(u.formatacao),
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

      doc.font('serif').fontSize(9).fillColor('#647389');
      const metaTop = [
        act.codigo,
        SITUACAO_LABELS[act.situacao],
        act.dataAto
          ? `Ato: ${act.dataAto.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
          : null,
        act.dataPublicacao
          ? `Pub.: ${act.dataPublicacao.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
          : null,
      ].filter(Boolean);
      if (metaTop.length) {
        doc.text(metaTop.join('  ·  '), { align: 'left' });
        doc.moveDown(0.6);
      }

      const headerTop = doc.y;
      const brasaoH = 52;
      const brasaoW = Math.round(brasaoH * (1022 / 870));
      try {
        if (fs.existsSync(BRASAO_PATH)) {
          doc.image(BRASAO_PATH, doc.page.margins.left, headerTop, {
            height: brasaoH,
            width: brasaoW,
          });
        }
      } catch {
        /* brasão opcional no PDF */
      }
      const textX = doc.page.margins.left + brasaoW + 12;
      const textWidth = doc.page.width - doc.page.margins.right - textX;
      doc.font('serif-bold').fontSize(12).fillColor('#0F1B2D');
      doc.text('Prefeitura Municipal de Franca/SP', textX, headerTop + 8, {
        width: textWidth,
        align: 'left',
      });
      if (act.orgaoOrigem) {
        doc.font('serif').fontSize(9).fillColor('#36465B').text(act.orgaoOrigem, textX, doc.y, {
          width: textWidth,
          align: 'left',
        });
      }
      doc.y = Math.max(doc.y, headerTop + brasaoH) + 12;
      doc.x = doc.page.margins.left;

      const prefixo = resolveTituloPrefixo(
        act.prefixoTituloModo,
        act.prefixoTitulo,
        act.orgaosOrigem ?? [],
      );
      const tituloFormal = formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto, {
        atoConjunto: act.atoConjunto,
        prefixo,
      });
      doc.font('serif-bold').fontSize(13).fillColor('#0F1B2D').text(tituloFormal, { align: 'center' });
      doc.moveDown(0.6);
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const ementaWidth = pageWidth * 0.5;
      const ementaX = doc.page.margins.left + (pageWidth - ementaWidth);
      const ementaY = doc.y;
      const ementaUnit = act.units.find((u) => u.tipoUnidade === 'ementa');
      const ementaText = ementaUnit
        ? unitHtmlToPlainText(ementaUnit.texto)
        : unitHtmlToPlainText(act.ementa);
      doc.font('serif').fontSize(11).fillColor('#0F1B2D').text(ementaText, ementaX, ementaY, {
        width: ementaWidth,
        align: 'left',
      });
      doc.x = doc.page.margins.left;
      doc.moveDown(1);

      for (const unit of sortUnitsForDisplay(act.units)) {
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
    const isStructural = [
      'parte',
      'livro',
      'titulo',
      'subtitulo',
      'capitulo',
      'subcapitulo',
      'secao',
      'subsecao',
      'anexo',
    ].includes(unit.tipoUnidade);
    const isPreamble = unit.tipoUnidade === 'preambulo';
    const isConsiderando = unit.tipoUnidade === 'considerando';
    const isSimple = unit.tipoUnidade === 'texto_simples';
    const isRevoked = unit.status === 'revogada';
    const plain = unitHtmlToPlainText(unit.texto);
    const fmt = parseFormatacao(unit.formatacao);

    if (isSimple) {
      const align = (fmt?.align ?? 'center') as 'left' | 'center' | 'right' | 'justify';
      if (fmt?.bold) doc.font('serif-bold');
      else doc.font('serif');
      doc.fontSize(11).fillColor('#0F1B2D');
      const opts: { align: typeof align; lineGap: number; characterSpacing?: number } = {
        align,
        lineGap: 3,
      };
      if (fmt?.letterSpacing === 'expanded') opts.characterSpacing = 2.5;
      doc.text(plain, opts);
      doc.moveDown(0.5);
      return;
    }

    if (isConsiderando) {
      doc.font('serif').fontSize(11).fillColor('#0F1B2D').text(plain, { align: 'justify', lineGap: 3 });
      doc.moveDown(0.4);
      return;
    }

    if (isPreamble) {
      doc.font('serif').fontSize(11).fillColor('#36465B').text(plain, { align: 'center' });
      doc.moveDown(0.75);
      return;
    }

    if (isStructural) {
      doc.font('serif-bold').fontSize(11).fillColor('#0F1B2D');
      if (unit.identificacao) doc.text(unit.identificacao, { align: 'center' });
      doc.text(plain, { align: 'center' });
      doc.moveDown(0.75);
      return;
    }

    if (unit.tipoUnidade === 'ementa') return;

    if (unit.tipoUnidade === 'artigo') {
      const prefix = unit.identificacao ? `${unit.identificacao} ` : '';
      doc.font('serif-bold').fontSize(11).fillColor(isRevoked ? '#97A3B6' : '#0F1B2D');
      if (isRevoked) {
        doc.text(prefix + plain, { strike: true, lineGap: 4 });
      } else {
        doc.text(prefix, { continued: true });
        doc.font('serif').text(plain, { lineGap: 4 });
      }
    } else {
      doc.font('serif').fontSize(11).fillColor('#0F1B2D').text(plain, { indent: 24, lineGap: 3 });
    }

    if (unit.nota) {
      doc.moveDown(0.2);
      doc.font('serif').fontSize(9).fillColor('#B5680A').text(unit.nota, { indent: 12 });
    }
    doc.moveDown(0.5);
  }
}
