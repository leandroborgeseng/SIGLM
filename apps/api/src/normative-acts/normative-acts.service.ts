import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActSituacao,
  ActType,
  Prisma,
  PublicationStatus,
  UnitStatus,
  UnitType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsolidationService } from '../consolidation/consolidation.service';
import { AddUnitDto, CreateActDto, DeleteUnitDto, SaveLegislativeEffectsDto, SaveUnitsDto, UpdateActDto } from './normative-acts.dto';
import { buildActSlug, formatActCode, formatFormalTitle, parseSlug } from './normative-acts.utils';
import {
  buildActSnapshot,
  diffSnapshots,
  recordInternalHistory,
  type ActSnapshot,
} from './act-versioning.utils';
import { defaultIdentificacao, validateUnitsHierarchy } from './unit-hierarchy.utils';
import {
  buildFtsFilterSql,
  normalizeSearchTerm,
  parseNumeroSearch,
  refreshSearchVector,
} from './search.utils';
import { parseFormatacao, sanitizeUnitHtml } from '../common/rich-text.utils';

export interface SearchActsQuery {
  q?: string;
  tipo?: ActType;
  situacao?: ActSituacao;
  ano?: number;
  numero?: number;
  assunto?: string;
  publicadoDe?: string;
  publicadoAte?: string;
  page?: number;
  limit?: number;
}

function extraFilters(query: SearchActsQuery): Prisma.NormativeActWhereInput {
  const dateFilter =
    query.publicadoDe || query.publicadoAte
      ? {
          ...(query.publicadoDe && { gte: new Date(query.publicadoDe) }),
          ...(query.publicadoAte && { lte: new Date(query.publicadoAte) }),
        }
      : undefined;

  return {
    ...(query.numero && { numero: query.numero }),
    ...(query.assunto && { assunto: { contains: query.assunto, mode: 'insensitive' } }),
    ...(dateFilter && { dataPublicacao: dateFilter }),
  };
}

function ftsFilterParams(query: SearchActsQuery) {
  return {
    tipo: query.tipo,
    situacao: query.situacao,
    ano: query.ano,
    numero: query.numero,
    assunto: query.assunto,
    publicadoDe: query.publicadoDe,
    publicadoAte: query.publicadoAte,
  };
}

@Injectable()
export class NormativeActsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consolidation: ConsolidationService,
  ) {}

  async searchPublic(query: SearchActsQuery) {
    const term = query.q ? normalizeSearchTerm(query.q) : '';
    if (term) {
      try {
        return await this.searchPublicFullText(query, term);
      } catch {
        return this.searchPublicLegacy(query, term);
      }
    }
    return this.searchPublicLegacy(query);
  }

  private async searchPublicFullText(query: SearchActsQuery, term: string) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;
    const numero = parseNumeroSearch(term);

    const params: unknown[] = [term];
    let idx = 2;

    let searchSql = `(na.search_vector @@ websearch_to_tsquery('portuguese', $1)`;
    if (numero !== null) {
      params.push(numero);
      searchSql += ` OR na.numero = $${idx++}`;
    }
    searchSql += ')';

    const filters = buildFtsFilterSql(ftsFilterParams(query), idx);
    params.push(...filters.params);
    idx = filters.nextIndex;

    const whereBase = `na.status_publicacao = 'publicado' AND ${searchSql}${filters.sql}`;

    const countRows = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM normative_acts na WHERE ${whereBase}`,
      ...params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const limitIdx = idx++;
    const offsetIdx = idx++;
    params.push(limit, skip);

    type FtsRow = {
      id: string;
      tipo: ActType;
      numero: number;
      ano: number;
      ementa: string;
      situacao: ActSituacao;
      dataPublicacao: Date | null;
      orgaoOrigem: string | null;
      assunto: string | null;
      slug: string;
      rank: number;
      snippet: string | null;
    };

    const rows = await this.prisma.$queryRawUnsafe<FtsRow[]>(
      `
      SELECT
        na.id,
        na.tipo,
        na.numero,
        na.ano,
        na.ementa,
        na.situacao,
        na.data_publicacao AS "dataPublicacao",
        na.orgao_origem AS "orgaoOrigem",
        na.assunto,
        na.slug,
        ts_rank(na.search_vector, websearch_to_tsquery('portuguese', $1)) AS rank,
        ts_headline(
          'portuguese',
          coalesce(na.ementa, '') || ' ' || coalesce(na.assunto, '') || ' ' || coalesce((
            SELECT string_agg(nu.texto, ' ')
            FROM normative_units nu
            WHERE nu.act_id = na.id
          ), ''),
          websearch_to_tsquery('portuguese', $1),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=12, MaxFragments=1'
        ) AS snippet
      FROM normative_acts na
      WHERE ${whereBase}
      ORDER BY rank DESC, na.ano DESC, na.numero DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
      ...params,
    );

    return {
      items: rows.map((act) => ({
        id: act.id,
        tipo: act.tipo,
        numero: act.numero,
        ano: act.ano,
        ementa: act.ementa,
        situacao: act.situacao,
        dataPublicacao: act.dataPublicacao,
        orgaoOrigem: act.orgaoOrigem,
        assunto: act.assunto,
        slug: act.slug,
        codigo: formatActCode(act.tipo, act.numero, act.ano),
        snippet: act.snippet ?? undefined,
        rank: Number(act.rank),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      searchMode: 'fulltext' as const,
    };
  }

  private async searchPublicLegacy(query: SearchActsQuery, term?: string) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where: Prisma.NormativeActWhereInput = {
      statusPublicacao: PublicationStatus.publicado,
      ...(query.tipo && { tipo: query.tipo }),
      ...(query.situacao && { situacao: query.situacao }),
      ...(query.ano && { ano: query.ano }),
      ...extraFilters(query),
    };

    if (term) {
      where.OR = [
        { ementa: { contains: term, mode: 'insensitive' } },
        { assunto: { contains: term, mode: 'insensitive' } },
        { palavrasChave: { has: term } },
        ...(parseNumeroSearch(term) === null ? [] : [{ numero: parseNumeroSearch(term)! }]),
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.normativeAct.findMany({
        where,
        orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          tipo: true,
          numero: true,
          ano: true,
          ementa: true,
          situacao: true,
          dataPublicacao: true,
          orgaoOrigem: true,
          assunto: true,
          slug: true,
        },
      }),
      this.prisma.normativeAct.count({ where }),
    ]);

    return {
      items: items.map((act) => ({
        ...act,
        codigo: formatActCode(act.tipo, act.numero, act.ano),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      searchMode: term ? ('legacy' as const) : undefined,
    };
  }

  async getFilterCounts() {
    const baseWhere = { statusPublicacao: PublicationStatus.publicado };

    const [byTipo, bySituacao, byAno, total] = await Promise.all([
      this.prisma.normativeAct.groupBy({
        by: ['tipo'],
        where: baseWhere,
        _count: true,
      }),
      this.prisma.normativeAct.groupBy({
        by: ['situacao'],
        where: baseWhere,
        _count: true,
      }),
      this.prisma.normativeAct.groupBy({
        by: ['ano'],
        where: baseWhere,
        _count: true,
        orderBy: { ano: 'desc' },
      }),
      this.prisma.normativeAct.count({ where: baseWhere }),
    ]);

    return {
      total,
      tipos: Object.fromEntries(byTipo.map((r) => [r.tipo, r._count])),
      situacoes: Object.fromEntries(bySituacao.map((r) => [r.situacao, r._count])),
      anos: Object.fromEntries(byAno.map((r) => [String(r.ano), r._count])),
    };
  }

  async getPublicBySlug(slug: string) {
    const act = await this.prisma.normativeAct.findFirst({
      where: { slug, statusPublicacao: PublicationStatus.publicado },
      include: {
        orgao: true,
        units: { orderBy: { ordem: 'asc' } },
        attachments: true,
        changesAsAlterada: {
          orderBy: { data: 'asc' },
          include: {
            normaAlteradora: {
              select: { tipo: true, numero: true, ano: true, slug: true },
            },
            unit: { select: { identificacao: true } },
          },
        },
      },
    });

    if (!act) throw new NotFoundException('Ato normativo não encontrado');

    // Enquanto houver versão de trabalho aberta, a consulta pública exibe a última revisão publicada
    let publicUnits = act.units;
    let publicEmenta = act.ementa;
    let publicAssunto = act.assunto;
    let publicDataAto = act.dataAto;
    let publicSituacao = act.situacao;
    let publicOrgao = act.orgao?.nome ?? act.orgaoOrigem;
    let publicAttachments = act.attachments;

    if (act.editionOpen) {
      const currentRev = await this.prisma.actPublicRevision.findFirst({
        where: { actId: act.id, isCurrent: true },
      });
      const snap = currentRev?.snapshot as ActSnapshot | null;
      if (snap?.units?.length) {
        publicUnits = snap.units.map((u) => ({
          id: u.id,
          actId: act.id,
          tipoUnidade: u.tipoUnidade as UnitType,
          identificacao: u.identificacao,
          texto: u.texto,
          formatacao: (u as { formatacao?: unknown }).formatacao ?? null,
          ordem: u.ordem,
          parentUnitId: u.parentUnitId,
          status: u.status as UnitStatus,
          origemActId: act.id,
          alteradoPorActId: null,
          createdAt: act.createdAt,
          updatedAt: act.updatedAt,
        })) as typeof act.units;
        publicEmenta = snap.metadata.ementa ?? act.ementa;
        publicAssunto = snap.metadata.assunto ?? act.assunto;
        publicDataAto = snap.metadata.dataAto ? new Date(snap.metadata.dataAto) : act.dataAto;
        publicSituacao = (snap.metadata.situacao as ActSituacao) ?? act.situacao;
        publicOrgao = snap.metadata.orgaoOrigem ?? publicOrgao;
      }
      if (snap?.attachments?.length) {
        publicAttachments = snap.attachments.map((a) => ({
          id: a.id,
          actId: act.id,
          tipo: a.tipo as (typeof act.attachments)[number]['tipo'],
          url: a.url,
          nome: a.nome,
          titulo: a.titulo,
          href: a.href,
          ordem: a.ordem,
          ativo: a.ativo,
          tamanho: null,
          hash: null,
          criadoEm: act.createdAt,
          substituidoEm: null,
        })) as typeof act.attachments;
      }
    }

    const ementaFromUnit = publicUnits.find((u) => u.tipoUnidade === UnitType.ementa);
    if (ementaFromUnit?.texto) {
      publicEmenta = ementaFromUnit.texto.replace(/<[^>]+>/g, '').trim() || publicEmenta;
    }

    const unitIds = publicUnits.map((u) => u.id);
    const versions = await this.prisma.normativeVersion.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { validoDe: 'asc' },
    });

    const versionsByUnit = versions.reduce<Record<string, typeof versions>>((acc, v) => {
      (acc[v.unitId] ??= []).push(v);
      return acc;
    }, {});

    const unitsWithNotes = publicUnits.map((unit) => {
      const change = act.changesAsAlterada.find((c) => c.unitId === unit.id);
      return {
        ...unit,
        nota: change?.notaGerada ?? null,
        versoes: versionsByUnit[unit.id] ?? [],
      };
    });

    // Histórico público = apenas consolidação legislativa (NormativeChange), nunca histórico interno
    const history = act.changesAsAlterada.map((change) => ({
      id: change.id,
      data: change.data,
      tipoAlteracao: change.tipoAlteracao,
      nota: change.notaGerada,
      fundamento: change.fundamento,
      dispositivo: change.unit?.identificacao ?? null,
      normaAlteradora: change.normaAlteradora
        ? {
            codigo: formatActCode(
              change.normaAlteradora.tipo,
              change.normaAlteradora.numero,
              change.normaAlteradora.ano,
            ),
            slug: change.normaAlteradora.slug,
          }
        : null,
    }));

    const attachmentPayload = publicAttachments
      .filter((a) => a.ativo)
      .sort((a, b) => a.ordem - b.ordem || a.criadoEm.getTime() - b.criadoEm.getTime())
      .map((a) => ({
        id: a.id,
        tipo: a.tipo,
        url: a.url,
        nome: a.nome,
        titulo: a.titulo ?? a.nome,
        href: a.href,
        ordem: a.ordem,
        downloadUrl: a.url ? `/public/attachments/${a.id}/file` : null,
      }));

    const originalFile =
      attachmentPayload.find((a) => a.tipo === 'pdf_original' || a.tipo === 'digitalizado') ??
      null;
    const anexosTopo = attachmentPayload.filter((a) => a.tipo === 'anexo_topo');
    const anexosFinal = attachmentPayload.filter((a) => a.tipo === 'anexo_final');

    return {
      ...act,
      ementa: publicEmenta,
      assunto: publicAssunto,
      dataAto: publicDataAto,
      situacao: publicSituacao,
      orgaoOrigem: publicOrgao,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      tituloFormal: formatFormalTitle(act.tipo, act.numero, act.ano, publicDataAto),
      units: unitsWithNotes,
      history,
      attachments: attachmentPayload,
      arquivoOriginal: originalFile,
      anexosTopo,
      anexosFinal,
      changesAsAlterada: undefined,
      orgao: undefined,
      editionOpen: undefined,
    };
  }

  async getAdminList(query: SearchActsQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where: Prisma.NormativeActWhereInput = {
      ...(query.tipo && { tipo: query.tipo }),
      ...(query.situacao && { situacao: query.situacao }),
      ...(query.q?.trim() && {
        OR: [
          { ementa: { contains: query.q.trim(), mode: 'insensitive' } },
          { assunto: { contains: query.q.trim(), mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total, kpis] = await Promise.all([
      this.prisma.normativeAct.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.normativeAct.count({ where }),
      this.getAdminKpis(),
    ]);

    return {
      kpis,
      items: items.map((act) => ({
        ...act,
        codigo: formatActCode(act.tipo, act.numero, act.ano),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminKpis() {
    const [total, vigentes, emRevisao, publicadosMes] = await Promise.all([
      this.prisma.normativeAct.count(),
      this.prisma.normativeAct.count({ where: { situacao: ActSituacao.vigente } }),
      this.prisma.normativeAct.count({
        where: { statusPublicacao: PublicationStatus.em_revisao },
      }),
      this.prisma.normativeAct.count({
        where: {
          statusPublicacao: PublicationStatus.publicado,
          updatedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]);

    return { total, vigentes, emRevisao, publicadosMes };
  }

  async getAdminById(id: string) {
    const act = await this.prisma.normativeAct.findUnique({
      where: { id },
      include: {
        orgao: true,
        units: { orderBy: { ordem: 'asc' } },
        attachments: true,
      },
    });
    if (!act) throw new NotFoundException('Ato normativo não encontrado');

    const unitIds = act.units.map((u) => u.id);
    const versions = await this.prisma.normativeVersion.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { validoDe: 'desc' },
    });
    const effects = await this.prisma.legislativeEffect.findMany({
      where: { sourceUnitId: { in: unitIds } },
      orderBy: [{ sourceUnitId: 'asc' }, { ordem: 'asc' }],
    });
    const versionsByUnit = versions.reduce<Record<string, typeof versions>>((acc, v) => {
      (acc[v.unitId] ??= []).push(v);
      return acc;
    }, {});
    const effectsByUnit = effects.reduce<Record<string, typeof effects>>((acc, e) => {
      (acc[e.sourceUnitId] ??= []).push(e);
      return acc;
    }, {});

    return {
      ...act,
      orgaoOrigem: act.orgao?.nome ?? act.orgaoOrigem,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      tituloFormal: formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto),
      hierarchyValid: this.validateHierarchy(act.units),
      attachments: act.attachments.map((a) => ({
        id: a.id,
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
        downloadUrl: a.url ? `/public/attachments/${a.id}/file` : null,
        adminDownloadUrl: a.url ? `/admin/acts/${act.id}/attachments/${a.id}/file` : null,
        directLink: a.url ? `/public/attachments/${a.id}/file` : a.href,
      })),
      arquivoOriginal:
        act.attachments.find(
          (a) =>
            a.ativo && (a.tipo === 'pdf_original' || a.tipo === 'digitalizado'),
        ) ?? null,
      anexosTopo: act.attachments
        .filter((a) => a.ativo && a.tipo === 'anexo_topo')
        .sort((a, b) => a.ordem - b.ordem),
      anexosFinal: act.attachments
        .filter((a) => a.ativo && a.tipo === 'anexo_final')
        .sort((a, b) => a.ordem - b.ordem),
      units: act.units.map((unit) => ({
        ...unit,
        versoes: versionsByUnit[unit.id] ?? [],
        efeitosLegislativos: (effectsByUnit[unit.id] ?? []).map((e) => ({
          id: e.id,
          sourceUnitId: e.sourceUnitId,
          normaAlteradaActId: e.normaAlteradaActId,
          targetUnitId: e.targetUnitId,
          tipoEfeito: e.tipoEfeito,
          dataVigencia: e.dataVigencia.toISOString().slice(0, 10),
          observacoes: e.observacoes,
          tipoDispositivoIncluido: e.tipoDispositivoIncluido,
          posicionamento: e.posicionamento,
          referenciaUnitId: e.referenciaUnitId,
          textoNovo: e.textoNovo,
          redacaoUnitId: e.redacaoUnitId,
          novaIdentificacao: e.novaIdentificacao,
          ordem: e.ordem,
          appliedAt: e.appliedAt?.toISOString() ?? null,
        })),
      })),
    };
  }

  async saveLegislativeEffects(actId: string, dto: SaveLegislativeEffectsDto, userId?: string) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);

    const unitIds = new Set(act.units.map((u) => u.id));

    await this.prisma.$transaction(async (tx) => {
      await tx.legislativeEffect.deleteMany({
        where: { sourceUnit: { actId } },
      });

      for (const [i, effect] of dto.effects.entries()) {
        if (!unitIds.has(effect.sourceUnitId)) {
          throw new BadRequestException('Dispositivo de origem inválido para efeito legislativo');
        }
        await tx.legislativeEffect.create({
          data: {
            sourceUnitId: effect.sourceUnitId,
            normaAlteradaActId: effect.normaAlteradaActId,
            targetUnitId: effect.targetUnitId ?? null,
            tipoEfeito: effect.tipoEfeito,
            dataVigencia: new Date(effect.dataVigencia),
            observacoes: effect.observacoes ?? null,
            tipoDispositivoIncluido: effect.tipoDispositivoIncluido ?? null,
            posicionamento: effect.posicionamento ?? null,
            referenciaUnitId: effect.referenciaUnitId ?? null,
            textoNovo: effect.textoNovo ?? null,
            redacaoUnitId: effect.redacaoUnitId ?? null,
            novaIdentificacao: effect.novaIdentificacao ?? null,
            ordem: effect.ordem ?? i,
          },
        });
      }
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'efeitos_legislativos',
      resumo: 'Alterou efeitos legislativos',
      withSnapshot: true,
    });

    return this.getAdminById(actId);
  }

  private async resolveOrgaoFields(dto: {
    orgaoOrigemId?: string;
    orgaoOrigem?: string;
  }): Promise<{ orgaoOrigemId?: string | null; orgaoOrigem?: string | null }> {
    if (dto.orgaoOrigemId) {
      const org = await this.prisma.originOrg.findUnique({ where: { id: dto.orgaoOrigemId } });
      if (!org) throw new BadRequestException('Órgão de origem inválido');
      if (!org.ativo) throw new BadRequestException('Órgão de origem inativo');
      return { orgaoOrigemId: org.id, orgaoOrigem: org.nome };
    }
    if (dto.orgaoOrigem !== undefined) {
      return { orgaoOrigem: dto.orgaoOrigem || null, orgaoOrigemId: null };
    }
    return {};
  }

  async createAct(dto: CreateActDto) {
    const slug = buildActSlug(dto.tipo, dto.ano, dto.numero);
    const existing = await this.prisma.normativeAct.findFirst({
      where: { OR: [{ slug }, { tipo: dto.tipo, numero: dto.numero, ano: dto.ano }] },
    });
    if (existing) {
      throw new ConflictException('Já existe um ato com este tipo, número e ano');
    }

    const orgaoFields = await this.resolveOrgaoFields(dto);
    const dataAto = dto.dataAto ? new Date(dto.dataAto) : undefined;
    const ano = dataAto && !Number.isNaN(dataAto.getTime()) ? dataAto.getUTCFullYear() : dto.ano;

    const act = await this.prisma.normativeAct.create({
      data: {
        tipo: dto.tipo,
        numero: dto.numero,
        ano,
        ementa: dto.ementa?.trim() || 'Ementa pendente',
        assunto: dto.assunto,
        dataAto,
        dataPublicacao: dto.dataPublicacao ? new Date(dto.dataPublicacao) : undefined,
        ...orgaoFields,
        autoridadeSignataria: dto.autoridadeSignataria,
        palavrasChave: dto.palavrasChave ?? [],
        slug: buildActSlug(dto.tipo, ano, dto.numero),
        statusPublicacao: PublicationStatus.rascunho,
        situacao: ActSituacao.vigente,
      },
    });

    await recordInternalHistory(this.prisma, {
      actId: act.id,
      acao: 'criar_ato',
      resumo: 'Criou ato normativo (rascunho)',
      withSnapshot: true,
    });

    return {
      ...act,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      tituloFormal: formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto),
      hierarchyValid: true,
      units: [],
    };
  }

  async updateAct(id: string, dto: UpdateActDto, userId?: string) {
    const existing = await this.ensureAct(id);
    this.assertEditable(existing);
    const orgaoFields = await this.resolveOrgaoFields(dto);
    const dataAto =
      dto.dataAto !== undefined ? (dto.dataAto ? new Date(dto.dataAto) : null) : undefined;

    const act = await this.prisma.normativeAct.update({
      where: { id },
      data: {
        ...(dto.ementa !== undefined && { ementa: dto.ementa }),
        ...(dto.assunto !== undefined && { assunto: dto.assunto }),
        ...(dto.situacao !== undefined && { situacao: dto.situacao }),
        ...(dataAto !== undefined && { dataAto }),
        ...(dataAto instanceof Date &&
          !Number.isNaN(dataAto.getTime()) && { ano: dataAto.getUTCFullYear() }),
        ...(dto.dataPublicacao !== undefined && {
          dataPublicacao: dto.dataPublicacao ? new Date(dto.dataPublicacao) : null,
        }),
        ...orgaoFields,
        ...(dto.autoridadeSignataria !== undefined && {
          autoridadeSignataria: dto.autoridadeSignataria,
        }),
        ...(dto.palavrasChave !== undefined && { palavrasChave: dto.palavrasChave }),
        ...(dto.observacoesInternas !== undefined && {
          observacoesInternas: dto.observacoesInternas,
        }),
      },
      include: { units: { orderBy: { ordem: 'asc' } }, orgao: true },
    });

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId,
      acao: 'editar_metadados',
      resumo: 'Alterou metadados do ato',
      withSnapshot: true,
    });

    return {
      ...act,
      orgaoOrigem: act.orgao?.nome ?? act.orgaoOrigem,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      tituloFormal: formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto),
      hierarchyValid: this.validateHierarchy(act.units),
      orgao: undefined,
    };
  }

  async saveUnits(actId: string, dto: SaveUnitsDto, userId?: string) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);

    const sorted = [...dto.units].sort((a, b) => a.ordem - b.ordem);
    const ementaCount = sorted.filter((u) => u.tipoUnidade === UnitType.ementa).length;
    if (ementaCount > 1) {
      throw new BadRequestException('Só é permitida uma Ementa por ato/versão');
    }
    const existingUnits = await this.prisma.normativeUnit.findMany({ where: { actId } });
    const existingById = new Map(existingUnits.map((u) => [u.id, u]));

    await this.prisma.$transaction(async (tx) => {
      for (const input of sorted) {
        const texto = sanitizeUnitHtml(input.texto);
        const formatacao =
          input.formatacao === null
            ? Prisma.JsonNull
            : input.formatacao
              ? (parseFormatacao(input.formatacao) as unknown as Prisma.InputJsonValue)
              : undefined;

        if (input.id) {
          const prev = existingById.get(input.id);
          if (!prev) continue;
          if (prev.texto !== texto) {
            await tx.normativeVersion.updateMany({
              where: { unitId: input.id, validoAte: null },
              data: { validoAte: new Date() },
            });
            await tx.normativeVersion.create({
              data: {
                unitId: input.id,
                texto,
                validoDe: new Date(),
                origemActId: actId,
              },
            });
          }
          await tx.normativeUnit.update({
            where: { id: input.id },
            data: {
              texto,
              ordem: input.ordem,
              identificacao: input.identificacao,
              tipoUnidade: input.tipoUnidade,
              parentUnitId: input.parentUnitId ?? null,
              ...(formatacao !== undefined && { formatacao }),
            },
          });
        } else {
          const created = await tx.normativeUnit.create({
            data: {
              actId,
              tipoUnidade: input.tipoUnidade,
              identificacao: input.identificacao,
              texto,
              ordem: input.ordem,
              parentUnitId: input.parentUnitId ?? null,
              status: UnitStatus.vigente,
              origemActId: actId,
              ...(formatacao !== undefined &&
                formatacao !== Prisma.JsonNull && { formatacao }),
            },
          });
          await tx.normativeVersion.create({
            data: {
              unitId: created.id,
              texto,
              validoDe: new Date(),
              origemActId: actId,
            },
          });
        }
      }

      const ementaUnit = sorted.find((u) => u.tipoUnidade === UnitType.ementa);
      if (ementaUnit) {
        const plain = sanitizeUnitHtml(ementaUnit.texto).replace(/<[^>]+>/g, '').trim();
        await tx.normativeAct.update({
          where: { id: actId },
          data: { ementa: plain || act.ementa },
        });
      }
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'salvar_unidades',
      resumo: 'Salvou texto estruturado / ordenação',
      withSnapshot: true,
    });

    return this.getAdminById(actId);
  }

  async addUnit(actId: string, dto: AddUnitDto, userId?: string) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);
    const existing = [...act.units].sort((a, b) => a.ordem - b.ordem);

    if (dto.parentUnitId) {
      const parent = existing.find((u) => u.id === dto.parentUnitId);
      if (!parent) throw new BadRequestException('Dispositivo pai não encontrado');
    }

    if (dto.afterUnitId) {
      const after = existing.find((u) => u.id === dto.afterUnitId);
      if (!after) throw new BadRequestException('Elemento de referência não encontrado');
    }

    if (
      dto.tipoUnidade === UnitType.ementa &&
      existing.some((u) => u.tipoUnidade === UnitType.ementa)
    ) {
      throw new BadRequestException(
        'Este ato já possui Ementa. Edite a existente em vez de incluir outra.',
      );
    }

    const insertOrdem = dto.afterUnitId
      ? this.nextOrdemAfterUnit(existing, dto.afterUnitId)
      : this.nextOrdemAfterParent(existing, dto.parentUnitId ?? null);

    await this.prisma.$transaction(async (tx) => {
      const toShift = await tx.normativeUnit.findMany({
        where: { actId, ordem: { gte: insertOrdem } },
        orderBy: { ordem: 'desc' },
      });
      for (const u of toShift) {
        await tx.normativeUnit.update({
          where: { id: u.id },
          data: { ordem: u.ordem + 1 },
        });
      }

      const texto = sanitizeUnitHtml(dto.texto ?? '');
      const formatacao = dto.formatacao ? parseFormatacao(dto.formatacao) : null;

      const unit = await tx.normativeUnit.create({
        data: {
          actId,
          tipoUnidade: dto.tipoUnidade,
          identificacao:
            dto.identificacao ??
            defaultIdentificacao(dto.tipoUnidade, existing, dto.parentUnitId ?? null),
          texto,
          ordem: insertOrdem,
          parentUnitId: dto.parentUnitId ?? null,
          status: UnitStatus.vigente,
          origemActId: actId,
          ...(formatacao ? { formatacao: formatacao as unknown as Prisma.InputJsonValue } : {}),
        },
      });

      await tx.normativeVersion.create({
        data: {
          unitId: unit.id,
          texto,
          validoDe: act.dataAto ?? new Date(),
          origemActId: actId,
        },
      });
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'incluir_elemento',
      resumo: `Incluiu ${dto.tipoUnidade}${dto.identificacao ? ` (${dto.identificacao})` : ''}`,
      withSnapshot: true,
    });

    return this.getAdminById(actId);
  }

  async deleteUnit(actId: string, unitId: string, dto: DeleteUnitDto, userId?: string) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);

    const units = [...act.units].sort((a, b) => a.ordem - b.ordem);
    const unit = units.find((u) => u.id === unitId);
    if (!unit) throw new NotFoundException('Elemento não encontrado');

    const subtreeIds = this.collectSubtreeIds(unitId, units);
    const children = units.filter((u) => u.parentUnitId === unitId);
    const toDeleteIds =
      dto.mode === 'cascade' ? [...subtreeIds] : [unitId];

    if (dto.mode === 'reparent' && children.length > 0) {
      const newParentId = dto.newParentId === undefined ? unit.parentUnitId : dto.newParentId;
      if (newParentId) {
        if (toDeleteIds.includes(newParentId) || newParentId === unitId) {
          throw new BadRequestException('Novo vínculo inválido para os elementos subordinados');
        }
        if (!units.some((u) => u.id === newParentId)) {
          throw new BadRequestException('Elemento pai informado não encontrado');
        }
      }
    }

    const blockingEffects = await this.prisma.legislativeEffect.findMany({
      where: {
        OR: [
          { sourceUnitId: { in: toDeleteIds } },
          { targetUnitId: { in: toDeleteIds } },
          { referenciaUnitId: { in: toDeleteIds } },
          { redacaoUnitId: { in: toDeleteIds } },
        ],
      },
      select: {
        id: true,
        sourceUnitId: true,
        targetUnitId: true,
        referenciaUnitId: true,
        redacaoUnitId: true,
        tipoEfeito: true,
      },
    });

    const asSource = blockingEffects.filter((e) => toDeleteIds.includes(e.sourceUnitId));
    if (asSource.length > 0) {
      throw new BadRequestException(
        `Não é possível excluir: o elemento (ou subordinados) é origem de ${asSource.length} efeito(s) legislativo(s). Remova ou redistribua esses efeitos antes.`,
      );
    }

    const asRef = blockingEffects.filter(
      (e) =>
        (e.targetUnitId && toDeleteIds.includes(e.targetUnitId)) ||
        (e.referenciaUnitId && toDeleteIds.includes(e.referenciaUnitId)) ||
        (e.redacaoUnitId && toDeleteIds.includes(e.redacaoUnitId)),
    );
    if (asRef.length > 0 && !dto.confirmEffectCleanup) {
      throw new BadRequestException(
        `Há ${asRef.length} efeito(s) legislativo(s) referenciando este elemento. Confirme a limpeza desses vínculos (confirmEffectCleanup) ou ajuste-os antes.`,
      );
    }

    const changesCount = await this.prisma.normativeChange.count({
      where: { unitId: { in: toDeleteIds } },
    });
    if (changesCount > 0) {
      throw new BadRequestException(
        'Não é possível excluir: há registros de consolidação legislativa vinculados a este elemento. A exclusão administrativa não deve apagar o histórico público.',
      );
    }

    const subordinateNote =
      children.length === 0
        ? ''
        : dto.mode === 'cascade'
          ? ` (+ ${subtreeIds.size - 1} subordinado(s))`
          : ` (revinculando ${children.length} filho(s))`;
    const label = `${unit.identificacao ?? unit.tipoUnidade}${subordinateNote}`;

    await this.prisma.$transaction(async (tx) => {
      if (asRef.length > 0) {
        await tx.legislativeEffect.updateMany({
          where: { targetUnitId: { in: toDeleteIds } },
          data: { targetUnitId: null },
        });
        await tx.legislativeEffect.updateMany({
          where: { referenciaUnitId: { in: toDeleteIds } },
          data: { referenciaUnitId: null },
        });
        await tx.legislativeEffect.updateMany({
          where: { redacaoUnitId: { in: toDeleteIds } },
          data: { redacaoUnitId: null },
        });
      }

      if (dto.mode === 'reparent' && children.length > 0) {
        const newParentId =
          dto.newParentId === undefined ? unit.parentUnitId ?? null : dto.newParentId ?? null;
        await tx.normativeUnit.updateMany({
          where: { parentUnitId: unitId },
          data: { parentUnitId: newParentId },
        });
      }

      // Remove versões e o(s) elemento(s). Filhos em cascade já estão em toDeleteIds.
      await tx.normativeVersion.deleteMany({ where: { unitId: { in: toDeleteIds } } });

      // Apaga folhas primeiro para respeitar FK de hierarquia
      const remaining = new Set(toDeleteIds);
      while (remaining.size > 0) {
        const leafIds = [...remaining].filter((id) => {
          const stillHasChild = units.some(
            (u) => remaining.has(u.id) && u.parentUnitId === id && u.id !== id,
          );
          return !stillHasChild;
        });
        if (leafIds.length === 0) break;
        await tx.normativeUnit.deleteMany({ where: { id: { in: leafIds } } });
        for (const id of leafIds) remaining.delete(id);
      }

      const survivors = await tx.normativeUnit.findMany({
        where: { actId },
        orderBy: { ordem: 'asc' },
      });
      for (let i = 0; i < survivors.length; i++) {
        if (survivors[i].ordem !== i) {
          await tx.normativeUnit.update({
            where: { id: survivors[i].id },
            data: { ordem: i },
          });
        }
      }

      if (unit.tipoUnidade === UnitType.ementa) {
        await tx.normativeAct.update({
          where: { id: actId },
          data: { ementa: 'Ementa pendente' },
        });
      }
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'excluir_elemento',
      resumo: `Excluiu ${label} (${dto.mode})`,
      withSnapshot: true,
    });

    return this.getAdminById(actId);
  }

  async submitForReview(id: string, userId?: string) {
    const act = await this.ensureAct(id);
    if (act.statusPublicacao === PublicationStatus.publicado && !act.editionOpen) {
      throw new BadRequestException('Ato publicado — crie uma nova versão para editar');
    }
    if (act.units.length === 0) {
      throw new BadRequestException('Adicione ao menos um dispositivo antes de enviar');
    }

    // Versão de trabalho em ato já publicado permanece publicada; só rascunhos vão para em_revisao
    if (!act.editionOpen) {
      await this.prisma.normativeAct.update({
        where: { id },
        data: { statusPublicacao: PublicationStatus.em_revisao },
      });
    }

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId,
      acao: 'enviar_revisao',
      resumo: act.editionOpen
        ? 'Marcou versão de trabalho como pronta para publicação'
        : 'Enviou para revisão',
      withSnapshot: true,
    });

    return this.getAdminById(id);
  }

  async publish(id: string, userId?: string) {
    const act = await this.ensureAct(id);
    if (act.units.length === 0) {
      throw new BadRequestException('Ato sem dispositivos não pode ser publicado');
    }

    const isAdminCorrection = act.editionOpen;
    const last = await this.prisma.actPublicRevision.findFirst({
      where: { actId: id },
      orderBy: { revisionNumber: 'desc' },
    });
    const revisionNumber = (last?.revisionNumber ?? 0) + 1;
    const snapshot = await buildActSnapshot(this.prisma, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.actPublicRevision.updateMany({
        where: { actId: id, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.actPublicRevision.create({
        data: {
          actId: id,
          revisionNumber,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          isCurrent: true,
          publishedById: userId ?? null,
        },
      });
      await tx.normativeAct.update({
        where: { id },
        data: {
          statusPublicacao: PublicationStatus.publicado,
          editionOpen: false,
        },
      });
    });

    // Correção administrativa não reaplica consolidação nem gera histórico legislativo público
    if (!isAdminCorrection) {
      await this.consolidation.applyPendingEffectsForAct(id);
    }
    await refreshSearchVector(this.prisma, id);

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId,
      acao: 'publicacao',
      resumo: isAdminCorrection
        ? `Publicou correção administrativa (versão ${revisionNumber})`
        : `Publicou versão ${revisionNumber}`,
      revisionNumber,
      withSnapshot: true,
    });

    return this.getAdminById(id);
  }

  async createEdition(id: string, userId?: string) {
    const act = await this.ensureAct(id);
    if (act.statusPublicacao !== PublicationStatus.publicado) {
      throw new BadRequestException('Nova versão só se aplica a atos já publicados');
    }
    if (act.editionOpen) {
      return this.getAdminById(id);
    }

    // Garante snapshot público atual antes de liberar edição
    const currentPublic = await this.prisma.actPublicRevision.findFirst({
      where: { actId: id, isCurrent: true },
    });
    if (!currentPublic) {
      const snapshot = await buildActSnapshot(this.prisma, id);
      await this.prisma.actPublicRevision.create({
        data: {
          actId: id,
          revisionNumber: 1,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          isCurrent: true,
          publishedById: userId ?? null,
        },
      });
    }

    await this.prisma.normativeAct.update({
      where: { id },
      data: { editionOpen: true },
    });

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId,
      acao: 'criar_versao',
      resumo: 'Abriu nova versão de trabalho a partir da versão publicada',
      withSnapshot: true,
    });

    return this.getAdminById(id);
  }

  async listInternalHistory(actId: string) {
    await this.ensureAct(actId);
    return this.prisma.actInternalHistory.findMany({
      where: { actId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actId: true,
        userId: true,
        acao: true,
        resumo: true,
        revisionNumber: true,
        createdAt: true,
        user: { select: { id: true, nome: true, email: true } },
      },
    });
  }

  async getInternalHistoryEntry(actId: string, entryId: string) {
    await this.ensureAct(actId);
    const entry = await this.prisma.actInternalHistory.findFirst({
      where: { id: entryId, actId },
      include: { user: { select: { id: true, nome: true, email: true } } },
    });
    if (!entry) throw new NotFoundException('Registro de histórico não encontrado');
    return entry;
  }

  async compareInternalHistory(actId: string, leftId: string, rightId: string) {
    const [left, right] = await Promise.all([
      this.getInternalHistoryEntry(actId, leftId),
      this.getInternalHistoryEntry(actId, rightId),
    ]);
    if (!left.snapshot || !right.snapshot) {
      throw new BadRequestException('Um dos registros não possui fotografia completa');
    }
    return {
      left: { id: left.id, acao: left.acao, createdAt: left.createdAt, resumo: left.resumo },
      right: { id: right.id, acao: right.acao, createdAt: right.createdAt, resumo: right.resumo },
      diff: diffSnapshots(left.snapshot as unknown as ActSnapshot, right.snapshot as unknown as ActSnapshot),
    };
  }

  private assertEditable(act: { statusPublicacao: PublicationStatus; editionOpen: boolean }) {
    if (act.statusPublicacao === PublicationStatus.publicado && !act.editionOpen) {
      throw new BadRequestException(
        'Ato publicado — use “Criar nova versão” para editar sem alterar a consulta pública',
      );
    }
  }

  async resolveSlug(slugPath: string) {
    const parsed = parseSlug(slugPath);
    if (!parsed) throw new NotFoundException('Slug inválido');
    return this.getPublicBySlug(slugPath);
  }

  validateHierarchy(
    units: { id: string; ordem: number; tipoUnidade: UnitType; parentUnitId?: string | null }[],
  ): boolean {
    return validateUnitsHierarchy(units);
  }

  private nextOrdemAfterParent(
    units: { id: string; ordem: number; parentUnitId?: string | null }[],
    parentUnitId: string | null,
  ): number {
    if (!parentUnitId) return units.length;

    const parentIndex = units.findIndex((u) => u.id === parentUnitId);
    if (parentIndex < 0) return units.length;

    const subtreeIds = this.collectSubtreeIds(parentUnitId, units);
    const lastIndex = Math.max(
      ...units
        .map((u, i) => (subtreeIds.has(u.id) ? i : -1))
        .filter((i) => i >= 0),
    );
    return lastIndex + 1;
  }

  private nextOrdemAfterUnit(
    units: { id: string; ordem: number; parentUnitId?: string | null }[],
    afterUnitId: string,
  ): number {
    const idx = units.findIndex((u) => u.id === afterUnitId);
    if (idx < 0) return units.length;
    const subtreeIds = this.collectSubtreeIds(afterUnitId, units);
    const lastIndex = Math.max(
      ...units.map((u, i) => (subtreeIds.has(u.id) ? i : -1)).filter((i) => i >= 0),
    );
    return lastIndex + 1;
  }

  private collectSubtreeIds(
    rootId: string,
    units: { id: string; parentUnitId?: string | null }[],
  ): Set<string> {
    const ids = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of units) {
        if (u.parentUnitId && ids.has(u.parentUnitId) && !ids.has(u.id)) {
          ids.add(u.id);
          changed = true;
        }
      }
    }
    return ids;
  }

  private async ensureAct(id: string) {
    const act = await this.prisma.normativeAct.findUnique({
      where: { id },
      include: { units: true },
    });
    if (!act) throw new NotFoundException('Ato normativo não encontrado');
    return act;
  }

  async restoreUnitVersion(
    actId: string,
    unitId: string,
    versionId: string,
    userId?: string,
  ) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);

    const unit = act.units.find((u) => u.id === unitId);
    if (!unit) throw new NotFoundException('Dispositivo não encontrado');

    const version = await this.prisma.normativeVersion.findFirst({
      where: { id: versionId, unitId },
    });
    if (!version) throw new NotFoundException('Versão não encontrada');

    await this.prisma.$transaction(async (tx) => {
      await tx.normativeVersion.updateMany({
        where: { unitId, validoAte: null },
        data: { validoAte: new Date() },
      });
      await tx.normativeUnit.update({
        where: { id: unitId },
        data: { texto: version.texto },
      });
      await tx.normativeVersion.create({
        data: {
          unitId,
          texto: version.texto,
          validoDe: new Date(),
          origemActId: actId,
        },
      });
    });

    await recordInternalHistory(this.prisma, {
      actId,
      userId,
      acao: 'restaurar_texto',
      resumo: `Restaurou texto de ${unit.identificacao ?? unit.tipoUnidade}`,
      withSnapshot: true,
    });

    return this.getAdminById(actId);
  }

  private async createVersionForUnit(
    unitId: string,
    texto: string,
    actId: string,
    validoDe?: Date | null,
  ) {
    await this.prisma.normativeVersion.create({
      data: {
        unitId,
        texto,
        validoDe: validoDe ?? new Date(),
        origemActId: actId,
      },
    });
  }
}
