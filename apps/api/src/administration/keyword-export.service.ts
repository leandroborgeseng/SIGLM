import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { ZipFile } from 'yazl';
import { PrismaService } from '../prisma/prisma.service';
import { formatActCode, resolveTituloPrefixo } from '../normative-acts/normative-acts.utils';
import { ExportService } from '../export/export.service';
import { buildContentDisposition } from '../common/file-response';

const ZIP_MAX_ACTS = 300;

export type KeywordExportAct = {
  id: string;
  tipo: string;
  numero: number;
  ano: number;
  ementa: string;
  situacao: string;
  statusPublicacao: string;
  etapaEditorial: string;
  slug: string;
  assunto: string | null;
  palavrasChave: string[];
  dataPublicacao: Date | null;
  orgaoOrigem: string | null;
  codigo: string;
};

@Injectable()
export class KeywordExportService {
  private readonly logger = new Logger(KeywordExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly exports: ExportService,
  ) {}

  async listKeywords(): Promise<{ palavra: string; total: number }[]> {
    const rows = await this.prisma.$queryRaw<Array<{ palavra: string; total: number | bigint }>>`
      SELECT MIN(btrim(k)) AS palavra, COUNT(DISTINCT na.id)::int AS total
      FROM normative_acts na
      CROSS JOIN LATERAL unnest(na.palavras_chave) AS k
      WHERE btrim(k) <> ''
      GROUP BY lower(btrim(k))
      ORDER BY MIN(btrim(k)) ASC
    `;
    return rows.map((r) => ({
      palavra: r.palavra,
      total: Number(r.total),
    }));
  }

  async findByKeyword(keyword: string): Promise<KeywordExportAct[]> {
    const term = keyword.trim();
    if (!term) throw new BadRequestException('Informe uma palavra-chave');

    const idRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT na.id
      FROM normative_acts na
      WHERE EXISTS (
        SELECT 1 FROM unnest(na.palavras_chave) AS k
        WHERE lower(btrim(k)) = lower(btrim(${term}))
      )
      ORDER BY na.ano DESC, na.numero DESC
    `;

    if (idRows.length === 0) return [];

    const acts = await this.prisma.normativeAct.findMany({
      where: { id: { in: idRows.map((r) => r.id) } },
      orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
      select: {
        id: true,
        tipo: true,
        numero: true,
        ano: true,
        ementa: true,
        situacao: true,
        statusPublicacao: true,
        etapaEditorial: true,
        slug: true,
        assunto: true,
        palavrasChave: true,
        dataPublicacao: true,
        orgaoOrigem: true,
        atoConjunto: true,
        prefixoTituloModo: true,
        prefixoTitulo: true,
        originOrgs: { orderBy: { ordem: 'asc' }, include: { orgao: true } },
      },
    });

    return acts.map((a) => {
      const orgaos = a.originOrgs.map((l) => ({
        nome: l.orgao.nome,
        sigla: l.orgao.sigla,
      }));
      return {
        id: a.id,
        tipo: a.tipo,
        numero: a.numero,
        ano: a.ano,
        ementa: a.ementa,
        situacao: a.situacao,
        statusPublicacao: a.statusPublicacao,
        etapaEditorial: a.etapaEditorial,
        slug: a.slug,
        assunto: a.assunto,
        palavrasChave: a.palavrasChave,
        dataPublicacao: a.dataPublicacao,
        orgaoOrigem: orgaos.map((o) => o.nome).join('; ') || a.orgaoOrigem,
        codigo: formatActCode(a.tipo, a.numero, a.ano, {
          atoConjunto: a.atoConjunto,
          prefixo: resolveTituloPrefixo(a.prefixoTituloModo, a.prefixoTitulo, orgaos),
        }),
      };
    });
  }

  async streamZip(res: Response, keyword: string, actIds?: string[]) {
    const matches = await this.findByKeyword(keyword);
    if (matches.length === 0) {
      throw new NotFoundException('Nenhum ato encontrado com essa palavra-chave');
    }

    const allowed = new Set(matches.map((a) => a.id));
    const selected = actIds?.length
      ? matches.filter((a) => actIds.includes(a.id) && allowed.has(a.id))
      : matches;

    if (selected.length === 0) {
      throw new BadRequestException('Nenhum dos atos selecionados corresponde à palavra-chave');
    }
    if (selected.length > ZIP_MAX_ACTS) {
      throw new BadRequestException(
        `Selecione no máximo ${ZIP_MAX_ACTS} atos por exportação (há ${selected.length} selecionados).`,
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const safeKw = keyword
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'palavra-chave';
    const zipName = `atos-${safeKw}-${stamp}.zip`;

    res.setTimeout(10 * 60 * 1000);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', buildContentDisposition(zipName, 'attachment'));
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const zip = new ZipFile();
    const output = zip.outputStream as Readable;
    output.on('error', (err: Error) => {
      this.logger.error(`ZIP palavra-chave falhou: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || 'Erro ao gerar o ZIP' });
      } else {
        res.destroy(err);
      }
    });
    output.pipe(res);

    const usedNames = new Set<string>();
    for (const act of selected) {
      try {
        const { buffer, filename } = await this.exports.exportPdfById(act.id);
        let name = filename.replace(/[/\\]/g, '-');
        if (usedNames.has(name)) {
          name = `${act.id.slice(0, 8)}-${name}`;
        }
        usedNames.add(name);
        zip.addBuffer(buffer, name, { compress: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'erro';
        this.logger.warn(`PDF do ato ${act.id} falhou: ${message}`);
        const errName = `${act.codigo.replace(/\s+/g, '-').replace(/\//g, '-')}-erro.txt`;
        zip.addBuffer(
          Buffer.from(`Não foi possível gerar o PDF.\n${act.codigo}\n${message}\n`, 'utf8'),
          errName,
        );
      }
    }

    zip.end();
    await finished(output);
  }
}
