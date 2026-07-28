import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActSituacao,
  ActType,
  EditorialStage,
  ImportFormat,
  Prisma,
  PublicationStatus,
  UnitStatus,
  UnitType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.constants';
import { resolveEffectivePermissions, userContextInclude } from '../auth/effective-permissions';
import { ConsolidationService } from '../consolidation/consolidation.service';
import {
  actPublicPath,
  buildInternalNoteLink,
  buildOutboundEffectLabel,
  structuredTextAvailable,
  unitAnchorId,
} from '../consolidation/consolidation-notes.utils';
import {
  ActSignatoryInputDto,
  AddUnitDto,
  BatchUpdateActsDto,
  CreateActDto,
  DeleteUnitDto,
  SaveLegislativeEffectsDto,
  SaveUnitsDto,
  StructureFromOriginalDto,
  UpdateIdentifiedImportTextDto,
  UpdateActDto,
} from './normative-acts.dto';
import {
  assertCanEditStructureForUser,
  assertCanPublishForUser,
  assertCanReviewForUser,
  assignmentPermissionWarnings,
  buildActAccessHints,
  type ActResponsibleFields,
} from './act-responsible.utils';
import {
  buildActSlug,
  formatActCode,
  formatFormalTitle,
  parseSlug,
  resolveTituloPrefixo,
} from './normative-acts.utils';
import {
  buildActSnapshot,
  diffSnapshots,
  recordInternalHistory,
  actHasPendingStructuralChanges,
  hasStructuralDiff,
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
import * as path from 'path';
import { AttachmentsService } from '../attachments/attachments.service';
import { OcrService } from '../import/ocr.service';
import { TextExtractService } from '../import/text-extract.service';
import { extractIdentifiedText } from '../import/identified-text.utils';
import { mergeOcrPages, parseStructure } from '../import/structure.parser';
import {
  enrichStructureWithEffects,
  identificacaoFromBlock,
  prepareUnitBlocksFromStructure,
} from '../import/structure-blocks.utils';

export interface SearchActsQuery {
  q?: string;
  tipo?: ActType;
  situacao?: ActSituacao;
  /** Filtro admin: status de publicação (rascunho/em_revisao/publicado). */
  statusPublicacao?: PublicationStatus;
  /** Filtro admin: estágio editorial / de estruturação. */
  etapaEditorial?: EditorialStage;
  /** Busca parcial no código/slug/número (coluna Norma). */
  norma?: string;
  /** Busca parcial na ementa. */
  ementa?: string;
  ano?: number;
  numero?: number;
  /** Intervalo numérico (admin): interpreta 12.268 como 12268. */
  numeroDe?: number;
  numeroAte?: number;
  assunto?: string;
  publicadoDe?: string;
  publicadoAte?: string;
  /** Órgão de origem (via vínculos ActOriginOrg; atos conjuntos casam qualquer). */
  orgaoOrigemId?: string;
  /**
   * Escopo de sessão do órgão ativo (item 76).
   * Aplicado quando o usuário não está em “Todos os órgãos”.
   * Combina com orgaoOrigemId do filtro avançado (interseção).
   */
  scopeOrgaoId?: string;
  meioPublicacaoId?: string;
  /** Nome histórico de signatário (ActSignatory ou snapshots publicados). */
  signatarioNome?: string;
  responsavelEstruturacaoId?: string;
  responsavelRevisaoId?: string;
  page?: number;
  limit?: number;
}

function originOrgWhere(orgaoOrigemId: string): Prisma.NormativeActWhereInput {
  return {
    OR: [
      { originOrgs: { some: { orgaoId: orgaoOrigemId } } },
      { orgaoOrigemId: orgaoOrigemId },
    ],
  };
}

function buildPublicActWhere(
  query: Partial<SearchActsQuery>,
  omit: (keyof SearchActsQuery)[] = [],
): Prisma.NormativeActWhereInput {
  const q = { ...query };
  for (const key of omit) delete q[key];

  const and: Prisma.NormativeActWhereInput[] = [
    { statusPublicacao: PublicationStatus.publicado },
  ];

  if (q.tipo) and.push({ tipo: q.tipo });
  if (q.situacao) and.push({ situacao: q.situacao });
  if (q.ano) and.push({ ano: q.ano });
  if (q.numero) and.push({ numero: q.numero });
  if (q.assunto) {
    and.push({ assunto: { contains: q.assunto, mode: 'insensitive' } });
  }
  if (q.publicadoDe || q.publicadoAte) {
    and.push({
      dataPublicacao: {
        ...(q.publicadoDe && { gte: new Date(q.publicadoDe) }),
        ...(q.publicadoAte && { lte: new Date(q.publicadoAte) }),
      },
    });
  }
  if (q.orgaoOrigemId) and.push(originOrgWhere(q.orgaoOrigemId));

  return and.length === 1 ? and[0]! : { AND: and };
}

function extraFilters(query: SearchActsQuery): Prisma.NormativeActWhereInput {
  const dateFilter =
    query.publicadoDe || query.publicadoAte
      ? {
          ...(query.publicadoDe && { gte: new Date(query.publicadoDe) }),
          ...(query.publicadoAte && { lte: new Date(query.publicadoAte) }),
        }
      : undefined;

  const numeroRange =
    query.numeroDe != null || query.numeroAte != null
      ? {
          ...(query.numeroDe != null && { gte: query.numeroDe }),
          ...(query.numeroAte != null && { lte: query.numeroAte }),
        }
      : undefined;

  return {
    ...(query.numero && { numero: query.numero }),
    ...(numeroRange && { numero: numeroRange }),
    ...(query.assunto && { assunto: { contains: query.assunto, mode: 'insensitive' } }),
    ...(dateFilter && { dataPublicacao: dateFilter }),
    ...(query.orgaoOrigemId && originOrgWhere(query.orgaoOrigemId)),
    ...(query.meioPublicacaoId && { meioPublicacaoId: query.meioPublicacaoId }),
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
    orgaoOrigemId: query.orgaoOrigemId,
  };
}

@Injectable()
export class NormativeActsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consolidation: ConsolidationService,
    private readonly textExtract: TextExtractService,
    private readonly ocr: OcrService,
    private readonly attachments: AttachmentsService,
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
      atoConjunto: boolean;
      prefixoTituloModo: string;
      prefixoTitulo: string | null;
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
        na.ato_conjunto AS "atoConjunto",
        na.prefixo_titulo_modo AS "prefixoTituloModo",
        na.prefixo_titulo AS "prefixoTitulo",
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

    const orgByAct = await this.originOrgsByActIds(rows.map((r) => r.id));

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
        codigo: formatActCode(act.tipo, act.numero, act.ano, {
          atoConjunto: act.atoConjunto,
          prefixo: resolveTituloPrefixo(
            act.prefixoTituloModo,
            act.prefixoTitulo,
            orgByAct.get(act.id) ?? [],
          ),
        }),
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

  private async originOrgsByActIds(ids: string[]) {
    const map = new Map<string, { sigla?: string | null; nome?: string | null }[]>();
    if (!ids.length) return map;
    const links = await this.prisma.actOriginOrg.findMany({
      where: { actId: { in: ids } },
      include: { orgao: true },
      orderBy: { ordem: 'asc' },
    });
    for (const link of links) {
      const list = map.get(link.actId) ?? [];
      list.push({ sigla: link.orgao.sigla, nome: link.orgao.nome });
      map.set(link.actId, list);
    }
    return map;
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
          atoConjunto: true,
          prefixoTituloModo: true,
          prefixoTitulo: true,
        },
      }),
      this.prisma.normativeAct.count({ where }),
    ]);

    const orgByAct = await this.originOrgsByActIds(items.map((a) => a.id));

    return {
      items: items.map((act) => ({
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
        codigo: formatActCode(act.tipo, act.numero, act.ano, {
          atoConjunto: act.atoConjunto,
          prefixo: resolveTituloPrefixo(
            act.prefixoTituloModo,
            act.prefixoTitulo,
            orgByAct.get(act.id) ?? [],
          ),
        }),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      searchMode: term ? ('legacy' as const) : undefined,
    };
  }

  async getFilterCounts(query: Partial<SearchActsQuery> = {}) {
    const term = query.q ? normalizeSearchTerm(query.q) : '';
    let textIds: string[] | undefined;
    if (term) {
      textIds = await this.publicTextMatchIds(term);
      if (textIds.length === 0) {
        return { total: 0, tipos: {}, situacoes: {}, anos: {}, orgaos: [] };
      }
    }

    const where = (omit: (keyof SearchActsQuery)[] = []) => {
      const base = buildPublicActWhere(query, omit);
      if (!textIds) return base;
      return { AND: [base, { id: { in: textIds } }] };
    };

    const [byTipo, bySituacao, byAno, total, orgLinks, legacyOrgs] = await Promise.all([
      this.prisma.normativeAct.groupBy({
        by: ['tipo'],
        where: where(['tipo']),
        _count: true,
      }),
      this.prisma.normativeAct.groupBy({
        by: ['situacao'],
        where: where(['situacao']),
        _count: true,
      }),
      this.prisma.normativeAct.groupBy({
        by: ['ano'],
        where: where(['ano']),
        _count: true,
        orderBy: { ano: 'desc' },
      }),
      this.prisma.normativeAct.count({ where: where() }),
      this.prisma.actOriginOrg.groupBy({
        by: ['orgaoId'],
        where: { act: where(['orgaoOrigemId']) },
        _count: { _all: true },
      }),
      this.prisma.normativeAct.groupBy({
        by: ['orgaoOrigemId'],
        where: {
          AND: [
            where(['orgaoOrigemId']),
            { orgaoOrigemId: { not: null } },
            { originOrgs: { none: {} } },
          ],
        },
        _count: { _all: true },
      }),
    ]);

    const orgCounts = new Map<string, number>();
    for (const row of orgLinks) {
      orgCounts.set(row.orgaoId, (orgCounts.get(row.orgaoId) ?? 0) + row._count._all);
    }
    for (const row of legacyOrgs) {
      if (!row.orgaoOrigemId) continue;
      orgCounts.set(
        row.orgaoOrigemId,
        (orgCounts.get(row.orgaoOrigemId) ?? 0) + row._count._all,
      );
    }

    const orgIds = [...orgCounts.keys()];
    const orgRows =
      orgIds.length > 0
        ? await this.prisma.originOrg.findMany({
            where: { id: { in: orgIds } },
            orderBy: { nome: 'asc' },
          })
        : [];

    return {
      total,
      tipos: Object.fromEntries(byTipo.map((r) => [r.tipo, r._count])),
      situacoes: Object.fromEntries(bySituacao.map((r) => [r.situacao, r._count])),
      anos: Object.fromEntries(byAno.map((r) => [String(r.ano), r._count])),
      orgaos: orgRows.map((o) => ({
        id: o.id,
        nome: o.nome,
        sigla: o.sigla,
        count: orgCounts.get(o.id) ?? 0,
      })),
    };
  }

  /** IDs de atos públicos que batem com a busca textual (FTS + número). */
  private async publicTextMatchIds(term: string): Promise<string[]> {
    const numero = parseNumeroSearch(term);
    const params: unknown[] = [term];
    let searchSql = `(na.search_vector @@ websearch_to_tsquery('portuguese', $1)`;
    if (numero !== null) {
      params.push(numero);
      searchSql += ` OR na.numero = $2`;
    }
    searchSql += ')';

    try {
      const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT na.id FROM normative_acts na
         WHERE na.status_publicacao = 'publicado' AND ${searchSql}`,
        ...params,
      );
      return rows.map((r) => r.id);
    } catch {
      const rows = await this.prisma.normativeAct.findMany({
        where: {
          statusPublicacao: PublicationStatus.publicado,
          OR: [
            { ementa: { contains: term, mode: 'insensitive' } },
            { assunto: { contains: term, mode: 'insensitive' } },
            { textoIdentificadoImportacao: { contains: term, mode: 'insensitive' } },
            ...(numero !== null ? [{ numero }] : []),
          ],
        },
        select: { id: true },
        take: 5000,
      });
      return rows.map((r) => r.id);
    }
  }

  async getPublicOriginOrgs() {
    const linkRows = await this.prisma.actOriginOrg.findMany({
      where: { act: { statusPublicacao: PublicationStatus.publicado } },
      select: { orgaoId: true },
      distinct: ['orgaoId'],
    });
    const legacyRows = await this.prisma.normativeAct.findMany({
      where: {
        statusPublicacao: PublicationStatus.publicado,
        orgaoOrigemId: { not: null },
        originOrgs: { none: {} },
      },
      select: { orgaoOrigemId: true },
      distinct: ['orgaoOrigemId'],
    });

    const ids = [
      ...new Set([
        ...linkRows.map((r) => r.orgaoId),
        ...legacyRows.map((r) => r.orgaoOrigemId!).filter(Boolean),
      ]),
    ];
    if (!ids.length) return [];

    const orgs = await this.prisma.originOrg.findMany({
      where: { id: { in: ids } },
      orderBy: { nome: 'asc' },
    });

    return orgs.map((o) => ({
      id: o.id,
      nome: o.nome,
      sigla: o.sigla,
    }));
  }

  async getAdminHistoricalSignatoryNames(): Promise<string[]> {
    const fromActs = await this.prisma.actSignatory.findMany({
      select: { nome: true },
      distinct: ['nome'],
    });
    const fromRevisions = await this.prisma.$queryRaw<{ nome: string }[]>`
      SELECT DISTINCT trim(s->>'nome') AS nome
      FROM act_public_revisions apr,
        jsonb_array_elements(apr.snapshot->'metadata'->'signatories') AS s
      WHERE s->>'nome' IS NOT NULL AND trim(s->>'nome') != ''
    `;

    const names = new Set<string>();
    for (const row of fromActs) {
      const n = row.nome.trim();
      if (n) names.add(n);
    }
    for (const row of fromRevisions) {
      const n = row.nome?.trim();
      if (n) names.add(n);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  private async findActIdsBySignatoryName(nome: string): Promise<string[]> {
    const trimmed = nome.trim();
    const fromActs = await this.prisma.actSignatory.findMany({
      where: { nome: { equals: trimmed, mode: 'insensitive' } },
      select: { actId: true },
      distinct: ['actId'],
    });
    const fromRevisions = await this.prisma.$queryRaw<{ act_id: string }[]>`
      SELECT DISTINCT apr.act_id
      FROM act_public_revisions apr,
        jsonb_array_elements(apr.snapshot->'metadata'->'signatories') AS s
      WHERE lower(trim(s->>'nome')) = lower(trim(${trimmed}))
    `;
    return [
      ...new Set([
        ...fromActs.map((r) => r.actId),
        ...fromRevisions.map((r) => r.act_id),
      ]),
    ];
  }

  async getAdminFilterOptions() {
    const [orgaos, meios, signatarios, users] = await Promise.all([
      this.prisma.originOrg.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.publicationMedium.findMany({ orderBy: { nome: 'asc' } }),
      this.getAdminHistoricalSignatoryNames(),
      this.prisma.user.findMany({
        where: { ativo: true },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, email: true, ativo: true },
      }),
    ]);
    return { orgaos, meios, signatarios, users };
  }

  async getPublicBySlug(slug: string) {
    const act = await this.prisma.normativeAct.findFirst({
      where: { slug, statusPublicacao: PublicationStatus.publicado },
      include: {
        orgao: true,
        meioPublicacao: true,
        originOrgs: { orderBy: { ordem: 'asc' }, include: { orgao: true } },
        signatories: { orderBy: { ordem: 'asc' } },
        units: { orderBy: { ordem: 'asc' } },
        attachments: true,
        changesAsAlterada: {
          orderBy: { data: 'asc' },
          include: {
            normaAlteradora: {
              select: {
                tipo: true,
                numero: true,
                ano: true,
                slug: true,
                etapaEditorial: true,
                atoConjunto: true,
                prefixoTitulo: true,
                prefixoTituloModo: true,
              },
            },
            sourceUnit: { select: { id: true, identificacao: true, ordem: true } },
            externalSource: {
              select: { url: true, arquivoUrl: true, descricao: true, emissor: true },
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
    let publicMeio = act.meioPublicacao;
    let publicAtoConjunto = act.atoConjunto;
    let publicPrefixoModo = act.prefixoTituloModo;
    let publicPrefixo = act.prefixoTitulo;
    let publicOrgaos = act.originOrgs;
    let publicSignatarios = act.signatories;
    let publicDataPublicacao = act.dataPublicacao;

    if (act.editionOpen) {
      const currentRev = await this.prisma.actPublicRevision.findFirst({
        where: { actId: act.id, isCurrent: true },
      });
      const snap = currentRev?.snapshot as ActSnapshot | null;
      // Com versão de trabalho aberta, a consulta pública deve refletir SEMPRE o snapshot
      // publicado — inclusive atos “Somente arquivo original” (units vazias). Caso contrário
      // metadados/WIP estruturado vazam no portal antes da republicação.
      if (snap) {
        publicUnits = (snap.units ?? []).map((u) => ({
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
          dataAlteracao: null,
          createdAt: act.createdAt,
          updatedAt: act.updatedAt,
        })) as typeof act.units;
        publicEmenta = snap.metadata.ementa ?? act.ementa;
        publicAssunto = snap.metadata.assunto ?? act.assunto;
        publicDataAto = snap.metadata.dataAto ? new Date(snap.metadata.dataAto) : act.dataAto;
        publicSituacao = (snap.metadata.situacao as ActSituacao) ?? act.situacao;
        publicOrgao = snap.metadata.orgaoOrigem ?? publicOrgao;
        publicAtoConjunto = snap.metadata.atoConjunto ?? publicAtoConjunto;
        publicPrefixoModo = snap.metadata.prefixoTituloModo ?? publicPrefixoModo;
        publicPrefixo = snap.metadata.prefixoTitulo ?? publicPrefixo;
        publicDataPublicacao = snap.metadata.dataPublicacao
          ? new Date(snap.metadata.dataPublicacao)
          : publicDataPublicacao;
        if (snap.metadata.meioPublicacao || snap.metadata.meioPublicacaoId) {
          publicMeio = {
            id: snap.metadata.meioPublicacaoId ?? act.meioPublicacaoId ?? '',
            nome: snap.metadata.meioPublicacao ?? act.meioPublicacao?.nome ?? '',
            ativo: true,
            createdAt: act.createdAt,
            updatedAt: act.updatedAt,
          } as NonNullable<typeof act.meioPublicacao>;
        }
        if (Array.isArray(snap.metadata.signatories)) {
          publicSignatarios = snap.metadata.signatories.map((s, i) => ({
            id: `snap-sig-${i}`,
            actId: act.id,
            signatoryId: s.signatoryId,
            nome: s.nome,
            cargo: s.cargo,
            ordem: s.ordem,
            createdAt: act.createdAt,
          })) as typeof act.signatories;
        }
        if (snap.metadata.orgaoOrigemIds?.length) {
          const orgs = await this.prisma.originOrg.findMany({
            where: { id: { in: snap.metadata.orgaoOrigemIds } },
          });
          const byId = new Map(orgs.map((o) => [o.id, o]));
          publicOrgaos = snap.metadata.orgaoOrigemIds
            .map((orgaoId, ordem) => {
              const orgao = byId.get(orgaoId);
              if (!orgao) return null;
              return {
                actId: act.id,
                orgaoId,
                ordem,
                orgao,
              };
            })
            .filter((l): l is NonNullable<typeof l> => Boolean(l)) as typeof act.originOrgs;
        } else {
          // Snapshot sem IDs: evita vazar órgãos da versão de trabalho.
          publicOrgaos = [];
        }
        // Sempre isolar anexos do snapshot (lista vazia = nenhum anexo público).
        publicAttachments = Array.isArray(snap.attachments)
          ? (snap.attachments.map((a) => ({
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
            })) as typeof act.attachments)
          : [];
      } else {
        // editionOpen sem snapshot: não vazar WIP — conteúdo público vazio seguro.
        publicUnits = [];
        publicAttachments = [];
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

    const outboundChanges = await this.prisma.normativeChange.findMany({
      where: { sourceUnitId: { in: unitIds } },
      include: {
        normaAlterada: {
          select: {
            tipo: true,
            numero: true,
            ano: true,
            slug: true,
            etapaEditorial: true,
            atoConjunto: true,
            prefixoTitulo: true,
            prefixoTituloModo: true,
          },
        },
        unit: { select: { id: true, identificacao: true, ordem: true } },
      },
      orderBy: { data: 'asc' },
    });

    const outboundBySource = outboundChanges.reduce<Record<string, typeof outboundChanges>>(
      (acc, c) => {
        if (!c.sourceUnitId) return acc;
        (acc[c.sourceUnitId] ??= []).push(c);
        return acc;
      },
      {},
    );

    const unitsWithNotes = publicUnits.map((unit) => {
      const change = [...act.changesAsAlterada]
        .filter((c) => c.unitId === unit.id)
        .sort((a, b) => b.data.getTime() - a.data.getTime())[0];
      let notaLink: { href: string; externo?: boolean } | null = null;

      if (change?.origem === 'externa' && change.externalSource) {
        const extUrl = change.externalSource.url ?? change.externalSource.arquivoUrl;
        if (extUrl) notaLink = { href: extUrl, externo: true };
      } else if (change?.normaAlteradora) {
        const hasStructured = structuredTextAvailable(change.normaAlteradora.etapaEditorial);
        const href = buildInternalNoteLink(
          change.normaAlteradora,
          change.sourceUnit,
          hasStructured,
        );
        if (href) notaLink = { href };
      }

      const alteracoesSaida = (outboundBySource[unit.id] ?? []).map((c) => {
        const alterada = c.normaAlterada;
        const targetUnit = c.unit;
        const label = buildOutboundEffectLabel(
          c.tipoAlteracao,
          targetUnit?.identificacao ?? null,
          alterada,
        );
        const hasStructured = structuredTextAvailable(alterada.etapaEditorial);
        const base = actPublicPath(alterada.slug);
        const href =
          hasStructured && targetUnit
            ? `${base}#${unitAnchorId(targetUnit)}`
            : base;
        return { label, href };
      });

      return {
        ...unit,
        nota: change?.notaGerada ?? null,
        notaLink,
        alteracoesSaida,
        versoes: versionsByUnit[unit.id] ?? [],
      };
    });

    // Histórico público = apenas consolidação legislativa (NormativeChange), nunca histórico interno
    const history = act.changesAsAlterada.map((change) => ({
      id: change.id,
      data: change.data,
      tipoAlteracao: change.tipoAlteracao,
      origem: change.origem,
      incomplete: change.incomplete,
      nota: change.notaGerada,
      fundamento: change.fundamento,
      dispositivo: change.unit?.identificacao ?? null,
      sourceUnit: change.sourceUnit
        ? { id: change.sourceUnit.id, identificacao: change.sourceUnit.identificacao }
        : null,
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
      externalSource: change.externalSource
        ? {
            descricao: change.externalSource.descricao,
            emissor: change.externalSource.emissor,
            url: change.externalSource.url ?? change.externalSource.arquivoUrl,
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
    const arquivoPublicacao =
      attachmentPayload.find((a) => a.tipo === 'arquivo_publicacao') ?? null;
    const anexosTopo = attachmentPayload.filter((a) => a.tipo === 'anexo_topo');
    const anexosFinal = attachmentPayload.filter((a) => a.tipo === 'anexo_final');

    const orgaosOrigem = publicOrgaos.map((l) => ({
      id: l.orgao.id,
      nome: l.orgao.nome,
      sigla: l.orgao.sigla,
      ordem: l.ordem,
    }));
    // Com editionOpen, não usar órgãos live (WIP). Só o texto do snapshot.
    if (!orgaosOrigem.length && publicOrgao) {
      orgaosOrigem.push({
        id: act.editionOpen ? '' : (act.orgao?.id ?? act.orgaoOrigemId ?? ''),
        nome: publicOrgao,
        sigla: act.editionOpen ? null : (act.orgao?.sigla ?? null),
        ordem: 0,
      });
    }
    const signatarios = publicSignatarios.map((s) => ({
      id: s.id,
      signatoryId: s.signatoryId,
      nome: s.nome,
      cargo: s.cargo,
      ordem: s.ordem,
    }));
    const prefixoResolvido = resolveTituloPrefixo(
      publicPrefixoModo,
      publicPrefixo,
      orgaosOrigem,
    );

    // DTO público explícito — não espalhar `act` (evita vazar observacoesInternas, editionOpen, etc.).
    return {
      id: act.id,
      tipo: act.tipo,
      numero: act.numero,
      ano: act.ano,
      slug: act.slug,
      ementa: publicEmenta,
      assunto: publicAssunto,
      dataAto: publicDataAto,
      dataPublicacao: publicDataPublicacao,
      situacao: publicSituacao,
      orgaoOrigem: orgaosOrigem.map((o) => o.nome).join('; ') || publicOrgao,
      meioPublicacao: publicMeio
        ? { id: publicMeio.id, nome: publicMeio.nome }
        : null,
      orgaosOrigem,
      signatarios,
      atoConjunto: publicAtoConjunto,
      prefixoTituloModo: publicPrefixoModo,
      prefixoTitulo: publicPrefixo,
      codigo: formatActCode(act.tipo, act.numero, act.ano, {
        atoConjunto: publicAtoConjunto,
        prefixo: prefixoResolvido,
      }),
      tituloFormal: formatFormalTitle(act.tipo, act.numero, act.ano, publicDataAto, {
        atoConjunto: publicAtoConjunto,
        prefixo: prefixoResolvido,
      }),
      units: unitsWithNotes,
      history,
      attachments: attachmentPayload,
      arquivoOriginal: originalFile,
      arquivoPublicacao,
      anexosTopo,
      anexosFinal,
      etapaEditorial: act.etapaEditorial,
      /** Há texto estruturado na versão pública (não apenas arquivo original). */
      textoEstruturadoDisponivel: unitsWithNotes.length > 0,
    };
  }

  private async buildAdminListWhere(query: SearchActsQuery): Promise<Prisma.NormativeActWhereInput> {
    const and: Prisma.NormativeActWhereInput[] = [];

    if (query.tipo) and.push({ tipo: query.tipo });
    if (query.situacao) and.push({ situacao: query.situacao });
    if (query.statusPublicacao) and.push({ statusPublicacao: query.statusPublicacao });
    if (query.etapaEditorial) and.push({ etapaEditorial: query.etapaEditorial });

    const ementaTerm = query.ementa?.trim() || null;
    if (ementaTerm) {
      and.push({ ementa: { contains: ementaTerm, mode: 'insensitive' } });
    }

    const normaTerm = query.norma?.trim() || null;
    if (normaTerm) {
      const digits = normaTerm.replace(/\D/g, '');
      const num = digits ? Number(digits) : NaN;
      const yearMatch = normaTerm.match(/(19|20)\d{2}/);
      const year = yearMatch ? Number(yearMatch[0]) : null;
      const slugish = normaTerm.toLowerCase().replace(/\s+/g, '/').replace(/n[ºo°.]?/gi, '');
      and.push({
        OR: [
          { slug: { contains: slugish, mode: 'insensitive' } },
          { slug: { contains: normaTerm.replace(/\s+/g, '-'), mode: 'insensitive' } },
          { assunto: { contains: normaTerm, mode: 'insensitive' } },
          ...(!Number.isNaN(num) && num > 0 ? [{ numero: num }] : []),
          ...(year ? [{ ano: year }] : []),
        ],
      });
    }

    if (query.q?.trim() && !normaTerm && !ementaTerm) {
      const q = query.q.trim();
      and.push({
        OR: [
          { ementa: { contains: q, mode: 'insensitive' } },
          { assunto: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q.replace(/\s+/g, '/'), mode: 'insensitive' } },
        ],
      });
    }

    if (query.publicadoDe || query.publicadoAte) {
      const de = query.publicadoDe ? new Date(query.publicadoDe) : undefined;
      let ate = query.publicadoAte ? new Date(query.publicadoAte) : undefined;
      if (ate && !Number.isNaN(ate.getTime())) {
        ate = new Date(
          Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate(), 23, 59, 59, 999),
        );
      }
      and.push({
        dataPublicacao: {
          ...(de && !Number.isNaN(de.getTime()) ? { gte: de } : {}),
          ...(ate && !Number.isNaN(ate.getTime()) ? { lte: ate } : {}),
          not: null,
        },
      });
    }

    if (query.orgaoOrigemId) {
      and.push(originOrgWhere(query.orgaoOrigemId));
    }

    if (query.scopeOrgaoId && query.scopeOrgaoId !== query.orgaoOrigemId) {
      and.push(originOrgWhere(query.scopeOrgaoId));
    }

    if (query.numeroDe != null || query.numeroAte != null) {
      and.push({
        numero: {
          ...(query.numeroDe != null && { gte: query.numeroDe }),
          ...(query.numeroAte != null && { lte: query.numeroAte }),
        },
      });
    }

    if (query.meioPublicacaoId) {
      and.push({ meioPublicacaoId: query.meioPublicacaoId });
    }

    if (query.responsavelEstruturacaoId) {
      and.push({ responsavelEstruturacaoId: query.responsavelEstruturacaoId });
    }

    if (query.responsavelRevisaoId) {
      and.push({ responsavelRevisaoId: query.responsavelRevisaoId });
    }

    if (query.signatarioNome?.trim()) {
      const actIds = await this.findActIdsBySignatoryName(query.signatarioNome);
      and.push({ id: { in: actIds.length ? actIds : ['00000000-0000-0000-0000-000000000000'] } });
    }

    return and.length ? { AND: and } : {};
  }

  async getAdminList(query: SearchActsQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 50);
    const skip = (page - 1) * limit;

    const where = await this.buildAdminListWhere(query);

    const [items, total, kpis] = await Promise.all([
      this.prisma.normativeAct.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: limit,
        include: {
          originOrgs: { include: { orgao: true }, orderBy: { ordem: 'asc' } },
          responsavelEstruturacao: { select: { id: true, nome: true, email: true, ativo: true } },
          responsavelRevisao: { select: { id: true, nome: true, email: true, ativo: true } },
        },
      }),
      this.prisma.normativeAct.count({ where }),
      this.getAdminKpis(),
    ]);

    return {
      kpis,
      items: items.map((act) => {
        const orgs = act.originOrgs.map((l) => ({
          sigla: l.orgao.sigla,
          nome: l.orgao.nome,
        }));
        const prefixo = resolveTituloPrefixo(act.prefixoTituloModo, act.prefixoTitulo, orgs);
        const { originOrgs: _o, responsavelEstruturacao, responsavelRevisao, ...rest } = act;
        return {
          ...rest,
          codigo: formatActCode(act.tipo, act.numero, act.ano, {
            atoConjunto: act.atoConjunto,
            prefixo,
          }),
          responsavelEstruturacao: responsavelEstruturacao
            ? {
                id: responsavelEstruturacao.id,
                nome: responsavelEstruturacao.nome,
                email: responsavelEstruturacao.email,
                ativo: responsavelEstruturacao.ativo,
              }
            : null,
          responsavelRevisao: responsavelRevisao
            ? {
                id: responsavelRevisao.id,
                nome: responsavelRevisao.nome,
                email: responsavelRevisao.email,
                ativo: responsavelRevisao.ativo,
              }
            : null,
        };
      }),
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

  async getAdminById(id: string, viewer?: Pick<AuthUser, 'id' | 'permissions'>) {
    await this.repairProvisionalEmentaIfNeeded(id);

    const act = await this.prisma.normativeAct.findUnique({
      where: { id },
      include: {
        orgao: true,
        meioPublicacao: true,
        originOrgs: { orderBy: { ordem: 'asc' }, include: { orgao: true } },
        signatories: { orderBy: { ordem: 'asc' } },
        units: { orderBy: { ordem: 'asc' } },
        attachments: true,
        responsavelEstruturacao: { select: { id: true, nome: true, email: true, ativo: true } },
        responsavelRevisao: { select: { id: true, nome: true, email: true, ativo: true } },
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

    const mappedAttachments = act.attachments.map((a) => ({
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
    }));

    const orgaosOrigem = act.originOrgs.map((l) => ({
      id: l.orgao.id,
      nome: l.orgao.nome,
      sigla: l.orgao.sigla,
      ordem: l.ordem,
    }));
    if (!orgaosOrigem.length && act.orgao) {
      orgaosOrigem.push({
        id: act.orgao.id,
        nome: act.orgao.nome,
        sigla: act.orgao.sigla,
        ordem: 0,
      });
    }
    const signatarios = act.signatories.map((s) => ({
      id: s.id,
      signatoryId: s.signatoryId,
      nome: s.nome,
      cargo: s.cargo,
      ordem: s.ordem,
    }));
    const prefixoResolvido = resolveTituloPrefixo(
      act.prefixoTituloModo,
      act.prefixoTitulo,
      orgaosOrigem,
    );

    const assignmentWarnings: string[] = [];
    if (act.responsavelEstruturacaoId) {
      const perms = await this.loadUserPermissions(act.responsavelEstruturacaoId);
      assignmentWarnings.push(...assignmentPermissionWarnings(act.responsavelEstruturacaoId, perms));
    }
    if (act.responsavelRevisaoId && act.responsavelRevisaoId !== act.responsavelEstruturacaoId) {
      const perms = await this.loadUserPermissions(act.responsavelRevisaoId);
      assignmentWarnings.push(...assignmentPermissionWarnings(act.responsavelRevisaoId, perms));
    }

    return {
      ...act,
      orgaoOrigem: orgaosOrigem.map((o) => o.nome).join('; ') || act.orgao?.nome || act.orgaoOrigem,
      meioPublicacao: act.meioPublicacao
        ? { id: act.meioPublicacao.id, nome: act.meioPublicacao.nome }
        : null,
      orgaosOrigem,
      signatarios,
      responsavelEstruturacao: act.responsavelEstruturacao
        ? {
            id: act.responsavelEstruturacao.id,
            nome: act.responsavelEstruturacao.nome,
            email: act.responsavelEstruturacao.email,
            ativo: act.responsavelEstruturacao.ativo,
          }
        : null,
      responsavelRevisao: act.responsavelRevisao
        ? {
            id: act.responsavelRevisao.id,
            nome: act.responsavelRevisao.nome,
            email: act.responsavelRevisao.email,
            ativo: act.responsavelRevisao.ativo,
          }
        : null,
      codigo: formatActCode(act.tipo, act.numero, act.ano, {
        atoConjunto: act.atoConjunto,
        prefixo: prefixoResolvido,
      }),
      tituloFormal: formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto, {
        atoConjunto: act.atoConjunto,
        prefixo: prefixoResolvido,
      }),
      hierarchyValid: this.validateHierarchy(act.units),
      attachments: mappedAttachments,
      arquivoOriginal:
        act.attachments.find(
          (a) =>
            a.ativo && (a.tipo === 'pdf_original' || a.tipo === 'digitalizado'),
        ) ?? null,
      arquivoPublicacao:
        act.attachments.find((a) => a.ativo && a.tipo === 'arquivo_publicacao') ?? null,
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
      access: viewer
        ? buildActAccessHints(
            {
              etapaEditorial: act.etapaEditorial,
              statusPublicacao: act.statusPublicacao,
              editionOpen: act.editionOpen,
              responsavelEstruturacaoId: act.responsavelEstruturacaoId,
              responsavelRevisaoId: act.responsavelRevisaoId,
              responsavelEstruturacao: act.responsavelEstruturacao,
              responsavelRevisao: act.responsavelRevisao,
            },
            viewer,
            {
              hasStructuralChanges: await actHasPendingStructuralChanges(this.prisma, id),
              editable:
                act.statusPublicacao !== PublicationStatus.publicado || act.editionOpen,
              fileOnly: act.etapaEditorial === EditorialStage.somente_arquivo_original,
            },
          )
        : undefined,
      assignmentWarnings: assignmentWarnings.length ? [...new Set(assignmentWarnings)] : undefined,
      originOrgs: undefined,
      signatories: undefined,
      orgao: undefined,
    };
  }

  async saveLegislativeEffects(actId: string, dto: SaveLegislativeEffectsDto, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(actId);
    this.assertCanEditStructure(act, user);

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
      userId: user.id,
      acao: 'efeitos_legislativos',
      resumo: 'Alterou efeitos legislativos',
      withSnapshot: true,
    });

    await this.demoteAfterStructuralEdit(actId, act.etapaEditorial);
    return this.getAdminById(actId, user);
  }

  private formatResponsavelChangeSummary(
    existing: {
      responsavelEstruturacaoId: string | null;
      responsavelRevisaoId: string | null;
      responsavelEstruturacao?: { nome: string } | null;
      responsavelRevisao?: { nome: string } | null;
    },
    next: {
      responsavelEstruturacaoId?: string | null;
      responsavelRevisaoId?: string | null;
    },
  ): string {
    const parts: string[] = [];
    if (next.responsavelEstruturacaoId !== undefined) {
      const de = existing.responsavelEstruturacao?.nome ?? '—';
      parts.push(
        `estruturação: ${de} → ${next.responsavelEstruturacaoId ? 'novo responsável' : '—'}`,
      );
    }
    if (next.responsavelRevisaoId !== undefined) {
      const de = existing.responsavelRevisao?.nome ?? '—';
      parts.push(
        `revisão/publicação: ${de} → ${next.responsavelRevisaoId ? 'novo responsável' : '—'}`,
      );
    }
    return parts.length ? `Alterou responsáveis (${parts.join('; ')})` : 'Alterou responsáveis';
  }

  private async resolveOrgaoFields(dto: {
    orgaoOrigemId?: string;
    orgaoOrigem?: string;
    orgaoOrigemIds?: string[];
  }): Promise<{ orgaoOrigemId?: string | null; orgaoOrigem?: string | null }> {
    if (dto.orgaoOrigemIds !== undefined) {
      if (!dto.orgaoOrigemIds.length) {
        return { orgaoOrigemId: null, orgaoOrigem: null };
      }
      const primaryId = dto.orgaoOrigemIds[0];
      const org = await this.prisma.originOrg.findUnique({ where: { id: primaryId } });
      if (!org) throw new BadRequestException('Órgão de origem inválido');
      if (!org.ativo) throw new BadRequestException('Órgão de origem inativo');
      return { orgaoOrigemId: org.id, orgaoOrigem: org.nome };
    }
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

  private async resolveMeioPublicacaoId(
    meioPublicacaoId: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (meioPublicacaoId === undefined) return undefined;
    if (!meioPublicacaoId) return null;
    const medium = await this.prisma.publicationMedium.findUnique({
      where: { id: meioPublicacaoId },
    });
    if (!medium) throw new BadRequestException('Meio de publicação inválido');
    if (!medium.ativo) throw new BadRequestException('Meio de publicação inativo');
    return medium.id;
  }

  private async resolveResponsavelUserId(
    userId: string | null | undefined,
    fieldLabel: string,
    currentId?: string | null,
  ): Promise<string | null | undefined> {
    if (userId === undefined) return undefined;
    if (!userId) return null;
    if (currentId && userId === currentId) return userId;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException(`${fieldLabel}: usuário inválido`);
    if (!user.ativo) {
      throw new BadRequestException(`${fieldLabel}: não é possível atribuir usuário inativo`);
    }
    return user.id;
  }

  private async loadUserPermissions(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userContextInclude,
    });
    if (!user) return [];
    return resolveEffectivePermissions(user);
  }

  private async syncActOriginOrgs(actId: string, orgaoIds: string[]) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of orgaoIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }

    if (ordered.length) {
      const orgs = await this.prisma.originOrg.findMany({
        where: { id: { in: ordered } },
      });
      if (orgs.length !== ordered.length) {
        throw new BadRequestException('Um ou mais órgãos de origem são inválidos');
      }
      const inactive = orgs.find((o) => !o.ativo);
      if (inactive) throw new BadRequestException('Órgão de origem inativo');
      const byId = new Map(orgs.map((o) => [o.id, o]));
      const named = ordered.map((id) => byId.get(id)!);

      await this.prisma.$transaction([
        this.prisma.actOriginOrg.deleteMany({ where: { actId } }),
        this.prisma.actOriginOrg.createMany({
          data: ordered.map((orgaoId, ordem) => ({ actId, orgaoId, ordem })),
        }),
        this.prisma.normativeAct.update({
          where: { id: actId },
          data: {
            orgaoOrigemId: named[0]?.id ?? null,
            orgaoOrigem: named.map((o) => o.nome).join('; ') || null,
          },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.actOriginOrg.deleteMany({ where: { actId } }),
        this.prisma.normativeAct.update({
          where: { id: actId },
          data: { orgaoOrigemId: null, orgaoOrigem: null },
        }),
      ]);
    }
  }

  private async syncActSignatories(actId: string, items: ActSignatoryInputDto[]) {
    const sorted = [...items].sort((a, b) => a.ordem - b.ordem);
    for (const item of sorted) {
      if (item.signatoryId) {
        const sig = await this.prisma.signatory.findUnique({ where: { id: item.signatoryId } });
        if (!sig) throw new BadRequestException('Signatário inválido');
      }
    }

    await this.prisma.$transaction([
      this.prisma.actSignatory.deleteMany({ where: { actId } }),
      ...sorted.map((item, i) =>
        this.prisma.actSignatory.create({
          data: {
            actId,
            signatoryId: item.signatoryId || null,
            nome: item.nome.trim(),
            cargo: item.cargo.trim(),
            ordem: item.ordem ?? i,
          },
        }),
      ),
    ]);
  }

  private resolveOrgaoIdsToSync(dto: {
    orgaoOrigemIds?: string[];
    orgaoOrigemId?: string;
  }): string[] | undefined {
    if (dto.orgaoOrigemIds !== undefined) return dto.orgaoOrigemIds;
    if (dto.orgaoOrigemId !== undefined) {
      return dto.orgaoOrigemId ? [dto.orgaoOrigemId] : [];
    }
    return undefined;
  }

  async createAct(dto: CreateActDto) {
    const dataAto = dto.dataAto ? new Date(dto.dataAto) : undefined;
    const ano = dataAto && !Number.isNaN(dataAto.getTime()) ? dataAto.getUTCFullYear() : dto.ano;
    const slug = buildActSlug(dto.tipo, ano, dto.numero);
    const existing = await this.prisma.normativeAct.findFirst({
      where: { OR: [{ slug }, { tipo: dto.tipo, numero: dto.numero, ano }] },
    });
    if (existing) {
      throw new ConflictException('Já existe um ato com este tipo, número e ano');
    }

    const orgaoFields = await this.resolveOrgaoFields(dto);
    const meioPublicacaoId = await this.resolveMeioPublicacaoId(dto.meioPublicacaoId);

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
        ...(meioPublicacaoId !== undefined && { meioPublicacaoId }),
        ...(dto.atoConjunto !== undefined && { atoConjunto: dto.atoConjunto }),
        ...(dto.prefixoTituloModo !== undefined && { prefixoTituloModo: dto.prefixoTituloModo }),
        ...(dto.prefixoTitulo !== undefined && {
          prefixoTitulo: dto.prefixoTitulo?.trim() || null,
        }),
        autoridadeSignataria: dto.autoridadeSignataria,
        palavrasChave: dto.palavrasChave ?? [],
        slug,
        statusPublicacao: PublicationStatus.rascunho,
        situacao: ActSituacao.vigente,
      },
    });

    const orgaoIds = this.resolveOrgaoIdsToSync(dto);
    if (orgaoIds !== undefined) {
      await this.syncActOriginOrgs(act.id, orgaoIds);
    } else if (orgaoFields.orgaoOrigemId) {
      await this.syncActOriginOrgs(act.id, [orgaoFields.orgaoOrigemId]);
    }

    if (dto.signatories !== undefined) {
      await this.syncActSignatories(act.id, dto.signatories);
    }

    await recordInternalHistory(this.prisma, {
      actId: act.id,
      acao: 'criar_ato',
      resumo: 'Criou ato normativo (rascunho)',
      withSnapshot: true,
    });

    return this.getAdminById(act.id);
  }

  async updateAct(id: string, dto: UpdateActDto, user?: Pick<AuthUser, 'id' | 'permissions'>) {
    const existing = await this.ensureActWithResponsibles(id);
    this.assertEditable(existing);
    const orgaoFields = await this.resolveOrgaoFields(dto);
    const meioPublicacaoId = await this.resolveMeioPublicacaoId(dto.meioPublicacaoId);
    const responsavelEstruturacaoId = await this.resolveResponsavelUserId(
      dto.responsavelEstruturacaoId,
      'Responsável pela estruturação',
      existing.responsavelEstruturacaoId,
    );
    const responsavelRevisaoId = await this.resolveResponsavelUserId(
      dto.responsavelRevisaoId,
      'Responsável pela revisão e publicação',
      existing.responsavelRevisaoId,
    );
    const dataAto =
      dto.dataAto !== undefined ? (dto.dataAto ? new Date(dto.dataAto) : null) : undefined;

    let nextAno = existing.ano;
    let nextSlug: string | undefined;
    if (dataAto instanceof Date && !Number.isNaN(dataAto.getTime())) {
      nextAno = dataAto.getUTCFullYear();
      if (nextAno !== existing.ano) {
        nextSlug = buildActSlug(existing.tipo, nextAno, existing.numero);
        const clash = await this.prisma.normativeAct.findFirst({
          where: {
            OR: [
              { slug: nextSlug },
              { tipo: existing.tipo, numero: existing.numero, ano: nextAno },
            ],
            NOT: { id },
          },
        });
        if (clash) {
          throw new ConflictException('Já existe um ato com este tipo, número e ano');
        }
      }
    }

    await this.prisma.normativeAct.update({
      where: { id },
      data: {
        ...(dto.ementa !== undefined && { ementa: dto.ementa }),
        ...(dto.assunto !== undefined && { assunto: dto.assunto }),
        ...(dto.situacao !== undefined && { situacao: dto.situacao }),
        // etapaEditorial só via fluxo Encaminhar/Concluir/Devolver/Publicar (item 85)
        ...(dataAto !== undefined && { dataAto }),
        ...(nextAno !== existing.ano && { ano: nextAno }),
        ...(nextSlug && { slug: nextSlug }),
        ...(dto.dataPublicacao !== undefined && {
          dataPublicacao: dto.dataPublicacao ? new Date(dto.dataPublicacao) : null,
        }),
        ...orgaoFields,
        ...(meioPublicacaoId !== undefined && { meioPublicacaoId }),
        ...(dto.atoConjunto !== undefined && { atoConjunto: dto.atoConjunto }),
        ...(dto.prefixoTituloModo !== undefined && { prefixoTituloModo: dto.prefixoTituloModo }),
        ...(dto.prefixoTitulo !== undefined && {
          prefixoTitulo: dto.prefixoTitulo?.trim() || null,
        }),
        ...(dto.autoridadeSignataria !== undefined && {
          autoridadeSignataria: dto.autoridadeSignataria,
        }),
        ...(dto.palavrasChave !== undefined && { palavrasChave: dto.palavrasChave }),
        ...(dto.observacoesInternas !== undefined && {
          observacoesInternas: dto.observacoesInternas,
        }),
        ...(responsavelEstruturacaoId !== undefined && { responsavelEstruturacaoId }),
        ...(responsavelRevisaoId !== undefined && { responsavelRevisaoId }),
      },
    });

    const orgaoIds = this.resolveOrgaoIdsToSync(dto);
    if (orgaoIds !== undefined) {
      await this.syncActOriginOrgs(id, orgaoIds);
    } else if (dto.orgaoOrigemId && orgaoFields.orgaoOrigemId) {
      await this.syncActOriginOrgs(id, [orgaoFields.orgaoOrigemId]);
    }

    if (dto.signatories !== undefined) {
      await this.syncActSignatories(id, dto.signatories);
    }

    const changed: string[] = [];
    if (dto.dataPublicacao !== undefined) changed.push('dataPublicacao');
    if (dto.meioPublicacaoId !== undefined) changed.push('meioPublicacao');
    if (orgaoIds !== undefined || dto.orgaoOrigemId !== undefined) changed.push('orgaos');
    if (dto.signatories !== undefined) changed.push('signatarios');
    if (dto.prefixoTituloModo !== undefined || dto.prefixoTitulo !== undefined) {
      changed.push('prefixo');
    }
    if (dto.atoConjunto !== undefined) changed.push('atoConjunto');
    if (responsavelEstruturacaoId !== undefined || responsavelRevisaoId !== undefined) {
      changed.push('responsaveis');
    }

    const responsavelChanged =
      responsavelEstruturacaoId !== undefined || responsavelRevisaoId !== undefined;

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId: user?.id,
      acao: responsavelChanged ? 'alterar_responsaveis' : 'editar_metadados',
      resumo: responsavelChanged
        ? this.formatResponsavelChangeSummary(existing, {
            responsavelEstruturacaoId,
            responsavelRevisaoId,
          })
        : changed.length
          ? `Alterou metadados do ato (${changed.join(', ')})`
          : 'Alterou metadados do ato',
      withSnapshot: true,
    });

    return this.getAdminById(id, user);
  }

  async saveUnits(actId: string, dto: SaveUnitsDto, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(actId);
    this.assertCanEditStructure(act, user);

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
      userId: user.id,
      acao: 'salvar_unidades',
      resumo: 'Salvou texto estruturado / ordenação',
      withSnapshot: true,
    });

    await this.demoteAfterStructuralEdit(actId, act.etapaEditorial);

    return this.getAdminById(actId, user);
  }

  async addUnit(actId: string, dto: AddUnitDto, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(actId);
    this.assertCanEditStructure(act, user);
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
      userId: user.id,
      acao: 'incluir_elemento',
      resumo: `Incluiu ${dto.tipoUnidade}${dto.identificacao ? ` (${dto.identificacao})` : ''}`,
      withSnapshot: true,
    });

    await this.demoteAfterStructuralEdit(actId, act.etapaEditorial);
    return this.getAdminById(actId, user);
  }

  async deleteUnit(actId: string, unitId: string, dto: DeleteUnitDto, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(actId);
    this.assertCanEditStructure(act, user);

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
      userId: user.id,
      acao: 'excluir_elemento',
      resumo: `Excluiu ${label} (${dto.mode})`,
      withSnapshot: true,
    });

    await this.demoteAfterStructuralEdit(actId, act.etapaEditorial);
    return this.getAdminById(actId, user);
  }

  async submitForReview(id: string, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(id);
    assertCanEditStructureForUser(act, user);
    if (act.statusPublicacao === PublicationStatus.publicado && !act.editionOpen) {
      throw new BadRequestException('Ato publicado — crie uma nova versão para editar');
    }
    if (act.etapaEditorial === EditorialStage.somente_arquivo_original) {
      throw new BadRequestException('Inicie a estruturação antes de encaminhar para revisão');
    }
    if (act.units.length === 0) {
      throw new BadRequestException('Adicione ao menos um dispositivo antes de enviar');
    }
    if (
      act.etapaEditorial === EditorialStage.aguardando_revisao ||
      act.etapaEditorial === EditorialStage.revisado
    ) {
      throw new BadRequestException(
        act.etapaEditorial === EditorialStage.revisado
          ? 'Ato já revisado — utilize Publicar'
          : 'Ato já está aguardando revisão',
      );
    }

    const structural = await actHasPendingStructuralChanges(this.prisma, id);
    if (!structural) {
      throw new BadRequestException(
        'Não há alterações estruturais pendentes — a publicação de metadados não exige revisão',
      );
    }

    // Versão de trabalho em ato já publicado permanece publicada; só rascunhos vão para em_revisao
    if (!act.editionOpen) {
      await this.prisma.normativeAct.update({
        where: { id },
        data: {
          statusPublicacao: PublicationStatus.em_revisao,
          etapaEditorial: EditorialStage.aguardando_revisao,
        },
      });
    } else {
      await this.prisma.normativeAct.update({
        where: { id },
        data: { etapaEditorial: EditorialStage.aguardando_revisao },
      });
    }

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId: user.id,
      acao: 'enviar_revisao',
      resumo: `Encaminhou para revisão${this.responsaveisResumo(act)}`,
      withSnapshot: true,
    });

    return this.getAdminById(id, user);
  }

  async approveReview(id: string, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(id);
    assertCanReviewForUser(act, user);
    if (act.etapaEditorial !== EditorialStage.aguardando_revisao) {
      throw new BadRequestException('Só é possível concluir a revisão de atos em “Aguardando revisão”');
    }

    await this.prisma.normativeAct.update({
      where: { id },
      data: { etapaEditorial: EditorialStage.revisado },
    });

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId: user.id,
      acao: 'aprovar_revisao',
      resumo: `Concluiu a revisão${this.responsaveisResumo(act)}`,
      withSnapshot: true,
    });

    return this.getAdminById(id, user);
  }

  async returnToStructuring(id: string, user: AuthUser, justificativa: string) {
    const act = await this.ensureActWithResponsibles(id);
    assertCanReviewForUser(act, user);
    if (act.etapaEditorial !== EditorialStage.aguardando_revisao) {
      throw new BadRequestException('Só é possível devolver atos em “Aguardando revisão”');
    }
    const motivo = justificativa?.trim();
    if (!motivo || motivo.length < 3) {
      throw new BadRequestException(
        'Informe a justificativa da devolução para estruturação (mínimo 3 caracteres)',
      );
    }

    await this.prisma.normativeAct.update({
      where: { id },
      data: {
        etapaEditorial: EditorialStage.em_estruturacao,
        ...(!act.editionOpen && act.statusPublicacao === PublicationStatus.em_revisao
          ? { statusPublicacao: PublicationStatus.rascunho }
          : {}),
      },
    });

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId: user.id,
      acao: 'devolver_estruturacao',
      resumo: `Devolveu para estruturação: ${motivo}${this.responsaveisResumo(act)}`,
      withSnapshot: true,
    });

    return this.getAdminById(id, user);
  }

  async publish(id: string, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(id);
    assertCanPublishForUser(act, user);
    const fileOnly = act.etapaEditorial === EditorialStage.somente_arquivo_original;
    if (act.units.length === 0 && !fileOnly) {
      throw new BadRequestException('Ato sem dispositivos não pode ser publicado');
    }
    if (fileOnly && act.units.length === 0) {
      const hasOriginal = await this.prisma.attachment.findFirst({
        where: {
          actId: id,
          ativo: true,
          tipo: { in: ['pdf_original', 'digitalizado'] },
        },
      });
      if (!hasOriginal) {
        throw new BadRequestException(
          'Atos “Somente arquivo original” precisam do arquivo original anexado para publicar',
        );
      }
    }

    const structural = await actHasPendingStructuralChanges(this.prisma, id);
    if (structural && !fileOnly) {
      if (act.etapaEditorial === EditorialStage.aguardando_revisao) {
        throw new BadRequestException(
          'Conclua a revisão antes de publicar. Use “Concluir revisão” e depois “Publicar”.',
        );
      }
      if (act.etapaEditorial !== EditorialStage.revisado) {
        throw new BadRequestException(
          'Há alterações estruturais não revisadas. Encaminhe para revisão, conclua a revisão e só então publique.',
        );
      }
    }

    const isAdminCorrection = act.editionOpen;
    const last = await this.prisma.actPublicRevision.findFirst({
      where: { actId: id },
      orderBy: { revisionNumber: 'desc' },
    });
    const revisionNumber = (last?.revisionNumber ?? 0) + 1;
    const snapshot = await buildActSnapshot(this.prisma, id);
    const nextEtapa =
      act.units.length > 0
        ? EditorialStage.estruturado
        : EditorialStage.somente_arquivo_original;

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
          publishedById: user.id,
        },
      });
      await tx.normativeAct.update({
        where: { id },
        data: {
          statusPublicacao: PublicationStatus.publicado,
          editionOpen: false,
          etapaEditorial: nextEtapa,
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
      userId: user.id,
      acao: 'publicacao',
      resumo: isAdminCorrection
        ? `Publicou correção administrativa (versão ${revisionNumber})${this.responsaveisResumo(act)}`
        : `Publicou versão ${revisionNumber}${this.responsaveisResumo(act)}`,
      revisionNumber,
      withSnapshot: true,
    });

    return this.getAdminById(id, user);
  }

  async createEdition(id: string, user?: AuthUser) {
    const act = await this.ensureAct(id);
    if (act.statusPublicacao !== PublicationStatus.publicado) {
      throw new BadRequestException('Nova versão só se aplica a atos já publicados');
    }
    if (act.editionOpen) {
      return this.getAdminById(id, user);
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
          publishedById: user?.id ?? null,
        },
      });
    }

    // Não altera etapa editorial: correção só de metadados em “Somente arquivo original”
    // permanece nesse estágio até o usuário iniciar a estruturação explicitamente.
    await this.prisma.normativeAct.update({
      where: { id },
      data: { editionOpen: true },
    });

    const fileOnly = act.etapaEditorial === EditorialStage.somente_arquivo_original;
    await recordInternalHistory(this.prisma, {
      actId: id,
      userId: user?.id,
      acao: fileOnly ? 'editar_metadados' : 'criar_versao',
      resumo: fileOnly
        ? 'Abriu versão de trabalho para correção de metadados (permanece Somente arquivo original)'
        : 'Abriu nova versão de trabalho a partir da versão publicada',
      withSnapshot: true,
    });

    return this.getAdminById(id, user);
  }

  /** Inicia a estruturação de um ato “Somente arquivo original” no mesmo cadastro. */
  async startStructuring(id: string, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(id);
    if (act.etapaEditorial !== EditorialStage.somente_arquivo_original) {
      return this.getAdminById(id, user);
    }

    if (act.statusPublicacao === PublicationStatus.publicado && !act.editionOpen) {
      await this.createEdition(id, user);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.normativeAct.update({
        where: { id },
        data: { etapaEditorial: EditorialStage.em_estruturacao },
      });

      const existingUnits = await tx.normativeUnit.findMany({
        where: { actId: id },
        select: { id: true, tipoUnidade: true },
      });
      const hasEmenta = existingUnits.some((u) => u.tipoUnidade === UnitType.ementa);
      const provisional = act.ementa?.trim();
      const isPlaceholder =
        !provisional ||
        provisional === 'Ementa pendente' ||
        /^ementa pendente$/i.test(provisional);

      if (!hasEmenta && provisional && !isPlaceholder) {
        // Empurra unidades existentes para abrir espaço no início.
        if (existingUnits.length) {
          await tx.normativeUnit.updateMany({
            where: { actId: id },
            data: { ordem: { increment: 1 } },
          });
        }
        await tx.normativeUnit.create({
          data: {
            actId: id,
            tipoUnidade: UnitType.ementa,
            identificacao: 'Ementa',
            texto: provisional,
            ordem: 1,
            parentUnitId: null,
            status: UnitStatus.vigente,
            origemActId: id,
          },
        });
      }
    });

    await recordInternalHistory(this.prisma, {
      actId: id,
      userId: user.id,
      acao: 'iniciar_estruturacao',
      resumo: act.ementa?.trim()
        ? 'Iniciou estruturação e converteu a Ementa provisória em elemento do Texto Estruturado'
        : 'Iniciou estruturação do texto a partir do arquivo original',
      withSnapshot: true,
    });

    return this.getAdminById(id, user);
  }

  /** Estrutura automaticamente o Texto Estruturado a partir do arquivo original vinculado. */
  async structureFromOriginal(actId: string, dto: StructureFromOriginalDto, user: AuthUser) {
    const act = await this.ensureActWithResponsibles(actId);
    this.assertCanEditStructure(act, user);

    const attachment = await this.prisma.attachment.findFirst({
      where: {
        actId,
        ativo: true,
        tipo: { in: ['pdf_original', 'digitalizado'] },
      },
      orderBy: { criadoEm: 'desc' },
    });
    if (!attachment) {
      throw new BadRequestException(
        'Nenhum arquivo original vinculado ao ato. Anexe o documento em Metadados → Arquivo original.',
      );
    }

    const { absolutePath, nome } = await this.attachments.resolveAttachmentFile(
      actId,
      attachment.id,
    );

    const ext = path.extname(nome).toLowerCase();
    let usedOcr = false;
    let mediaConfianca = 95;

    let estrutura;
    if (ext === '.docx') {
      const { text } = await this.textExtract.extractDocx(absolutePath);
      estrutura = enrichStructureWithEffects(parseStructure(text, 96, nome));
    } else if (ext === '.pdf') {
      const { text, needsOcr } = await this.textExtract.extractPdf(absolutePath);
      if (needsOcr) {
        usedOcr = true;
        const pages = await this.ocr.processPdf(absolutePath);
        estrutura = enrichStructureWithEffects(mergeOcrPages(pages, nome));
        mediaConfianca = estrutura.mediaConfianca;
      } else {
        estrutura = enrichStructureWithEffects(parseStructure(text, 96, nome));
      }
    } else {
      throw new BadRequestException(
        'Formato não suportado para estruturação automática. Use PDF ou DOCX.',
      );
    }

    if (!estrutura.blocos.length) {
      throw new BadRequestException(
        'Não foi possível identificar elementos estruturais no arquivo original.',
      );
    }

    const existingUnits = [...act.units].sort((a, b) => a.ordem - b.ordem);
    const hasUnits = existingUnits.length > 0;
    const existingEmenta = existingUnits.find((u) => u.tipoUnidade === UnitType.ementa);

    if (hasUnits && !dto.confirmReplace) {
      throw new BadRequestException(
        'Este ato já possui estrutura. Confirme a substituição completa antes de continuar.',
      );
    }

    if (hasUnits) {
      await recordInternalHistory(this.prisma, {
        actId,
        userId: user.id,
        acao: 'auto_estruturacao',
        resumo: `Ponto de recuperação antes da estruturação automática (${existingUnits.length} elemento(s))`,
        withSnapshot: true,
      });
    }

    const { unitBlocks, skippedEmentaText } = prepareUnitBlocksFromStructure(estrutura.blocos, {
      fallbackEmenta: act.ementa,
      skipDetectedEmenta: Boolean(existingEmenta),
    });

    if (!unitBlocks.length && !existingEmenta) {
      throw new BadRequestException(
        'Não foi possível identificar elementos estruturais no arquivo original.',
      );
    }

    const baseOrdem = existingEmenta ? 1 : 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        const unitIdsToRemove = existingUnits
          .filter((u) => !(existingEmenta && u.id === existingEmenta.id))
          .map((u) => u.id);

        if (unitIdsToRemove.length) {
          await this.removeUnitsForStructureReplace(tx, unitIdsToRemove);
        }

        if (existingEmenta && existingEmenta.ordem !== 0) {
          await tx.normativeUnit.update({
            where: { id: existingEmenta.id },
            data: { ordem: 0 },
          });
        }

        const ordemToId = new Map<number, string>();
        if (existingEmenta) ordemToId.set(0, existingEmenta.id);

        for (const block of unitBlocks) {
          const ordem = baseOrdem + block.ordem;
          const texto = sanitizeUnitHtml(block.texto);
          const formatacao =
            block.tipo === 'texto_simples' && block.formatacao
              ? (block.formatacao as unknown as Prisma.InputJsonValue)
              : undefined;

          const unit = await tx.normativeUnit.create({
            data: {
              actId,
              tipoUnidade: block.tipo as UnitType,
              identificacao: identificacaoFromBlock(block),
              texto,
              ordem,
              parentUnitId: null,
              status: UnitStatus.vigente,
              origemActId: actId,
              ...(formatacao !== undefined && { formatacao }),
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

          ordemToId.set(ordem, unit.id);
        }

        for (const block of unitBlocks) {
          if (block.parentOrdem == null) continue;
          const unitId = ordemToId.get(baseOrdem + block.ordem);
          const parentId = ordemToId.get(baseOrdem + block.parentOrdem);
          if (!unitId || !parentId) continue;
          await tx.normativeUnit.update({
            where: { id: unitId },
            data: { parentUnitId: parentId },
          });
        }

        const ementaBlock = unitBlocks.find((b) => b.tipo === 'ementa');
        if (ementaBlock && !existingEmenta) {
          const plain = sanitizeUnitHtml(ementaBlock.texto).replace(/<[^>]+>/g, '').trim();
          if (plain) {
            await tx.normativeAct.update({
              where: { id: actId },
              data: { ementa: plain },
            });
          }
        }
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      throw new BadRequestException(`Falha ao aplicar estrutura detectada: ${msg}`);
    }

    const elementCount = unitBlocks.length + (existingEmenta ? 1 : 0);
    const ementaDiffers =
      Boolean(existingEmenta && skippedEmentaText) &&
      sanitizeUnitHtml(existingEmenta!.texto)
        .replace(/<[^>]+>/g, '')
        .trim()
        .toLowerCase() !== skippedEmentaText!.replace(/\s+/g, ' ').trim().toLowerCase();

    const resumoParts = [
      `Estruturação automática a partir de “${nome}”`,
      `${elementCount} elemento(s)`,
      hasUnits ? 'estrutura anterior substituída' : 'estrutura criada',
      usedOcr ? 'via OCR' : 'texto extraído',
    ];

    await recordInternalHistory(this.prisma, {
      actId,
      userId: user.id,
      acao: 'auto_estruturacao',
      resumo: resumoParts.join(' · '),
      withSnapshot: true,
    });

    await this.demoteAfterStructuralEdit(actId, act.etapaEditorial);

    const ocrNote = usedOcr
      ? `Texto obtido via OCR (confiança média ${Math.round(mediaConfianca)}%). Revise cuidadosamente.`
      : undefined;

    const ementaNote =
      existingEmenta && ementaDiffers
        ? 'Ementa existente mantida; o texto detectado no arquivo difere.'
        : undefined;

    return {
      act: await this.getAdminById(actId, user),
      elementCount,
      replaced: hasUnits,
      usedOcr,
      ocrNote,
      ementaPreserved: Boolean(existingEmenta),
      ementaNote,
      arquivo: nome,
    };
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

  /**
   * Corrige atos que iniciaram estruturação sem converter a Ementa provisória
   * da importação de acervo em elemento do Texto Estruturado.
   */
  private async repairProvisionalEmentaIfNeeded(actId: string) {
    const act = await this.prisma.normativeAct.findUnique({
      where: { id: actId },
      select: {
        id: true,
        ementa: true,
        etapaEditorial: true,
        units: { select: { id: true, tipoUnidade: true }, take: 200 },
      },
    });
    if (!act) return;
    if (act.etapaEditorial === EditorialStage.somente_arquivo_original) return;
    if (act.units.some((u) => u.tipoUnidade === UnitType.ementa)) return;

    const provisional = act.ementa?.trim();
    if (
      !provisional ||
      provisional === 'Ementa pendente' ||
      /^ementa pendente$/i.test(provisional)
    ) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      if (act.units.length) {
        await tx.normativeUnit.updateMany({
          where: { actId },
          data: { ordem: { increment: 1 } },
        });
      }
      await tx.normativeUnit.create({
        data: {
          actId,
          tipoUnidade: UnitType.ementa,
          identificacao: 'Ementa',
          texto: provisional,
          ordem: 1,
          parentUnitId: null,
          status: UnitStatus.vigente,
          origemActId: actId,
        },
      });
    });

    await recordInternalHistory(this.prisma, {
      actId,
      acao: 'converter_ementa_provisoria',
      resumo:
        'Converteu Ementa provisória da importação de acervo em elemento do Texto Estruturado (correção automática)',
      withSnapshot: true,
    });
  }

  private assertEditable(act: { statusPublicacao: PublicationStatus; editionOpen: boolean }) {
    if (act.statusPublicacao === PublicationStatus.publicado && !act.editionOpen) {
      throw new BadRequestException(
        'Ato publicado — use “Criar nova versão” para editar sem alterar a consulta pública',
      );
    }
  }

  /** Bloqueia alteração do Texto Estruturado enquanto o ato estiver só com arquivo original. */
  private assertCanEditStructure(act: ActResponsibleFields, user: Pick<AuthUser, 'id' | 'permissions'>) {
    this.assertEditable(act);
    if (act.etapaEditorial === EditorialStage.somente_arquivo_original) {
      throw new BadRequestException(
        'A estruturação deste ato ainda não foi iniciada. Utilize a ação “Iniciar estruturação” antes de editar o Texto Estruturado.',
      );
    }
    assertCanEditStructureForUser(act, user);
  }

  /**
   * Após alteração estrutural efetiva: se já estava revisado (ou estruturado em edição),
   * volta para “Em estruturação”. Em “Aguardando revisão” permanece (correções do revisor).
   * Save idempotente (mesmo conteúdo) não rebaixa o estágio.
   */
  private async demoteAfterStructuralEdit(actId: string, etapa: EditorialStage) {
    if (etapa === EditorialStage.revisado) {
      const lastApprove = await this.prisma.actInternalHistory.findFirst({
        where: { actId, acao: 'aprovar_revisao' },
        orderBy: { createdAt: 'desc' },
        select: { snapshot: true },
      });
      if (!lastApprove?.snapshot) return;
      const current = await buildActSnapshot(this.prisma, actId);
      if (!hasStructuralDiff(lastApprove.snapshot as unknown as ActSnapshot, current)) {
        return;
      }
    } else if (etapa === EditorialStage.estruturado) {
      const changed = await actHasPendingStructuralChanges(this.prisma, actId);
      if (!changed) return;
    } else {
      return;
    }

    await this.prisma.normativeAct.update({
      where: { id: actId },
      data: { etapaEditorial: EditorialStage.em_estruturacao },
    });
  }

  private responsaveisResumo(act: {

    responsavelEstruturacao?: { nome: string } | null;
    responsavelRevisao?: { nome: string } | null;
  }) {
    const est = act.responsavelEstruturacao?.nome;
    const rev = act.responsavelRevisao?.nome;
    const parts: string[] = [];
    if (est) parts.push(`resp. estruturação: ${est}`);
    if (rev) parts.push(`resp. revisão: ${rev}`);
    return parts.length ? ` (${parts.join('; ')})` : '';
  }

  private async ensureActWithResponsibles(id: string) {
    const act = await this.prisma.normativeAct.findUnique({
      where: { id },
      include: {
        units: true,
        responsavelEstruturacao: { select: { id: true, nome: true, ativo: true } },
        responsavelRevisao: { select: { id: true, nome: true, ativo: true } },
      },
    });
    if (!act) throw new NotFoundException('Ato normativo não encontrado');
    return act;
  }

  /** Remove unidades (e dependências) antes de substituir a estrutura automaticamente. */
  private async removeUnitsForStructureReplace(
    tx: Prisma.TransactionClient,
    unitIds: string[],
  ) {
    if (!unitIds.length) return;

    await tx.legislativeEffect.deleteMany({
      where: { sourceUnitId: { in: unitIds } },
    });
    await tx.legislativeEffect.updateMany({
      where: { targetUnitId: { in: unitIds } },
      data: { targetUnitId: null },
    });
    await tx.legislativeEffect.updateMany({
      where: { referenciaUnitId: { in: unitIds } },
      data: { referenciaUnitId: null },
    });
    await tx.legislativeEffect.updateMany({
      where: { redacaoUnitId: { in: unitIds } },
      data: { redacaoUnitId: null },
    });

    const changesCount = await tx.normativeChange.count({
      where: { unitId: { in: unitIds } },
    });
    if (changesCount > 0) {
      throw new BadRequestException(
        'Não é possível substituir a estrutura: há registros de consolidação vinculados a elementos atuais.',
      );
    }

    await tx.normativeVersion.deleteMany({ where: { unitId: { in: unitIds } } });

    const remaining = new Set(unitIds);
    while (remaining.size > 0) {
      const batch = await tx.normativeUnit.findMany({
        where: { id: { in: [...remaining] } },
        select: { id: true, parentUnitId: true },
      });
      const leafIds = batch
        .filter((u) => !batch.some((v) => v.parentUnitId === u.id && remaining.has(v.id)))
        .map((u) => u.id);
      if (!leafIds.length) break;
      await tx.normativeUnit.deleteMany({ where: { id: { in: leafIds } } });
      for (const id of leafIds) remaining.delete(id);
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

  async batchUpdateActs(dto: BatchUpdateActsDto, user: AuthUser) {
    if (!user.permissions.includes('acts:write')) {
      throw new ForbiddenException('Sem permissão para alterar atos em lote');
    }

    let actIds: string[] = [];
    if (dto.selectAllFiltered) {
      const parseNum = (v?: string) => {
        if (!v?.trim()) return undefined;
        const cleaned = v.replace(/\./g, '').replace(/,/g, '');
        const n = Number(cleaned);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      const where = await this.buildAdminListWhere({
        tipo: dto.tipo,
        situacao: dto.situacao,
        statusPublicacao: dto.statusPublicacao as PublicationStatus | undefined,
        etapaEditorial: dto.etapaEditorial,
        norma: dto.norma,
        ementa: dto.ementa,
        publicadoDe: dto.publicadoDe,
        publicadoAte: dto.publicadoAte,
        orgaoOrigemId: dto.orgaoOrigemId,
        numeroDe: parseNum(dto.numeroDe),
        numeroAte: parseNum(dto.numeroAte),
        meioPublicacaoId: dto.meioPublicacaoIdFilter,
        signatarioNome: dto.signatarioNome,
        responsavelEstruturacaoId: dto.responsavelEstruturacaoIdFilter,
        responsavelRevisaoId: dto.responsavelRevisaoIdFilter,
      });
      const rows = await this.prisma.normativeAct.findMany({ where, select: { id: true } });
      actIds = rows.map((r) => r.id);
    } else {
      actIds = [...new Set(dto.actIds ?? [])];
    }

    if (!actIds.length) {
      throw new BadRequestException('Nenhum ato selecionado para a operação em lote');
    }

    const processed: { actId: string; codigo: string }[] = [];
    const skipped: { actId: string; codigo: string; reason: string }[] = [];

    for (const actId of actIds) {
      try {
        const act = await this.ensureActWithResponsibles(actId);
        const codigo = formatActCode(act.tipo, act.numero, act.ano, { atoConjunto: act.atoConjunto });

        if (act.statusPublicacao === PublicationStatus.publicado && !act.editionOpen) {
          skipped.push({
            actId,
            codigo,
            reason: 'Ato publicado — crie nova versão antes de alterar',
          });
          continue;
        }

        if (dto.action === 'set_responsavel_estruturacao') {
          const nextId = await this.resolveResponsavelUserId(
            dto.responsavelEstruturacaoId,
            'Responsável pela estruturação',
            act.responsavelEstruturacaoId,
          );
          if (nextId === undefined) {
            skipped.push({ actId, codigo, reason: 'Responsável não informado' });
            continue;
          }
          await this.prisma.normativeAct.update({
            where: { id: actId },
            data: { responsavelEstruturacaoId: nextId },
          });
          await recordInternalHistory(this.prisma, {
            actId,
            userId: user.id,
            acao: 'alterar_responsaveis',
            resumo: this.formatResponsavelChangeSummary(act, { responsavelEstruturacaoId: nextId }),
            withSnapshot: true,
          });
        } else if (dto.action === 'set_responsavel_revisao') {
          const nextId = await this.resolveResponsavelUserId(
            dto.responsavelRevisaoId,
            'Responsável pela revisão e publicação',
            act.responsavelRevisaoId,
          );
          if (nextId === undefined) {
            skipped.push({ actId, codigo, reason: 'Responsável não informado' });
            continue;
          }
          await this.prisma.normativeAct.update({
            where: { id: actId },
            data: { responsavelRevisaoId: nextId },
          });
          await recordInternalHistory(this.prisma, {
            actId,
            userId: user.id,
            acao: 'alterar_responsaveis',
            resumo: this.formatResponsavelChangeSummary(act, { responsavelRevisaoId: nextId }),
            withSnapshot: true,
          });
        } else if (dto.action === 'set_meio_publicacao') {
          const meioId = await this.resolveMeioPublicacaoId(dto.meioPublicacaoId);
          if (meioId === undefined) {
            skipped.push({ actId, codigo, reason: 'Meio de publicação não informado' });
            continue;
          }
          await this.prisma.normativeAct.update({
            where: { id: actId },
            data: { meioPublicacaoId: meioId },
          });
          await recordInternalHistory(this.prisma, {
            actId,
            userId: user.id,
            acao: 'editar_metadados',
            resumo: 'Alterou meio de publicação (lote)',
            withSnapshot: true,
          });
        } else if (dto.action === 'set_signatario') {
          if (!dto.signatory?.nome?.trim() || !dto.signatory?.cargo?.trim()) {
            skipped.push({ actId, codigo, reason: 'Signatário incompleto' });
            continue;
          }
          if (dto.signatory.signatoryId) {
            const sig = await this.prisma.signatory.findUnique({
              where: { id: dto.signatory.signatoryId },
            });
            if (!sig) {
              skipped.push({ actId, codigo, reason: 'Signatário inválido' });
              continue;
            }
          }
          const existing = await this.prisma.actSignatory.findMany({
            where: { actId },
            orderBy: { ordem: 'asc' },
          });
          const items =
            dto.signatory.mode === 'replace'
              ? [
                  {
                    signatoryId: dto.signatory.signatoryId || null,
                    nome: dto.signatory.nome.trim(),
                    cargo: dto.signatory.cargo.trim(),
                    ordem: 0,
                  },
                ]
              : [
                  ...existing.map((s, i) => ({
                    signatoryId: s.signatoryId,
                    nome: s.nome,
                    cargo: s.cargo,
                    ordem: i,
                  })),
                  {
                    signatoryId: dto.signatory.signatoryId || null,
                    nome: dto.signatory.nome.trim(),
                    cargo: dto.signatory.cargo.trim(),
                    ordem: existing.length,
                  },
                ];
          await this.syncActSignatories(actId, items);
          await recordInternalHistory(this.prisma, {
            actId,
            userId: user.id,
            acao: 'editar_metadados',
            resumo:
              dto.signatory.mode === 'replace'
                ? 'Substituiu signatário(s) em lote'
                : 'Acrescentou signatário em lote',
            withSnapshot: true,
          });
        }

        processed.push({ actId, codigo });
      } catch (e) {
        const act = await this.prisma.normativeAct.findUnique({
          where: { id: actId },
          select: { tipo: true, numero: true, ano: true, atoConjunto: true },
        });
        skipped.push({
          actId,
          codigo: act
            ? formatActCode(act.tipo, act.numero, act.ano, { atoConjunto: act.atoConjunto })
            : actId,
          reason: e instanceof Error ? e.message : 'Erro desconhecido',
        });
      }
    }

    const actionLabels: Record<BatchUpdateActsDto['action'], string> = {
      set_responsavel_estruturacao: 'Definir responsável pela estruturação',
      set_responsavel_revisao: 'Definir responsável pela revisão/publicação',
      set_meio_publicacao: 'Definir meio de publicação',
      set_signatario: 'Definir signatário',
    };

    return {
      action: dto.action,
      actionLabel: actionLabels[dto.action],
      totalSelected: actIds.length,
      processedCount: processed.length,
      skippedCount: skipped.length,
      processed,
      skipped,
      summary: `${processed.length} ato(s) atualizado(s), ${skipped.length} ignorado(s)/com erro`,
    };
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
    user: AuthUser,
  ) {
    const act = await this.ensureActWithResponsibles(actId);
    this.assertCanEditStructure(act, user);

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
      userId: user.id,
      acao: 'restaurar_texto',
      resumo: `Restaurou texto de ${unit.identificacao ?? unit.tipoUnidade}`,
      withSnapshot: true,
    });

    await this.demoteAfterStructuralEdit(actId, act.etapaEditorial);
    return this.getAdminById(actId, user);
  }

  async updateIdentifiedImportText(
    actId: string,
    dto: UpdateIdentifiedImportTextDto,
    user?: AuthUser,
  ) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);

    await this.prisma.normativeAct.update({
      where: { id: actId },
      data: {
        textoIdentificadoImportacao: dto.textoIdentificadoImportacao.trim() || null,
      },
    });

    await refreshSearchVector(this.prisma, actId);

    await recordInternalHistory(this.prisma, {
      actId,
      userId: user?.id,
      acao: 'editar_texto_identificado',
      resumo: 'Alterou o texto identificado na importação',
      withSnapshot: false,
    });

    return this.getAdminById(actId, user);
  }

  async identifyTextFromOriginal(actId: string, user?: AuthUser) {
    const act = await this.ensureAct(actId);
    this.assertEditable(act);

    const attachment = await this.prisma.attachment.findFirst({
      where: {
        actId,
        ativo: true,
        tipo: { in: ['pdf_original', 'digitalizado'] },
      },
      orderBy: { criadoEm: 'desc' },
    });
    if (!attachment) {
      throw new BadRequestException(
        'Nenhum arquivo original vinculado ao ato. Anexe o documento em Metadados → Arquivo original.',
      );
    }

    const { absolutePath, nome } = await this.attachments.resolveAttachmentFile(
      actId,
      attachment.id,
    );

    const ext = path.extname(nome).toLowerCase();
    const formato =
      ext === '.docx' ? ImportFormat.docx : ext === '.pdf' ? ImportFormat.pdf : null;
    if (!formato) {
      throw new BadRequestException(
        'Formato não suportado para identificação de texto. Use PDF ou DOCX.',
      );
    }

    const identified = await extractIdentifiedText(
      absolutePath,
      formato,
      this.textExtract,
      this.ocr,
    );

    if (!identified.text) {
      throw new BadRequestException(
        'Não foi possível identificar texto no arquivo original. Tente OCR manual ou outro arquivo.',
      );
    }

    await this.prisma.normativeAct.update({
      where: { id: actId },
      data: {
        textoIdentificadoImportacao: identified.text,
        textoIdentificadoOrigem: identified.origem,
      },
    });

    await refreshSearchVector(this.prisma, actId);

    await recordInternalHistory(this.prisma, {
      actId,
      userId: user?.id,
      acao: 'identificar_texto_original',
      resumo: `Identificou texto do arquivo original (${nome})`,
      withSnapshot: false,
    });

    return this.getAdminById(actId, user);
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
