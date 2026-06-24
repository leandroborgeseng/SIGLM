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
import { AddUnitDto, CreateActDto, SaveLegislativeEffectsDto, SaveUnitsDto, UpdateActDto } from './normative-acts.dto';
import { buildActSlug, formatActCode, parseSlug } from './normative-acts.utils';
import { defaultIdentificacao, validateUnitsHierarchy } from './unit-hierarchy.utils';
import {
  buildFtsFilterSql,
  normalizeSearchTerm,
  parseNumeroSearch,
  refreshSearchVector,
} from './search.utils';

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

    const unitIds = act.units.map((u) => u.id);
    const versions = await this.prisma.normativeVersion.findMany({
      where: { unitId: { in: unitIds } },
      orderBy: { validoDe: 'asc' },
    });

    const versionsByUnit = versions.reduce<Record<string, typeof versions>>((acc, v) => {
      (acc[v.unitId] ??= []).push(v);
      return acc;
    }, {});

    const unitsWithNotes = act.units.map((unit) => {
      const change = act.changesAsAlterada.find((c) => c.unitId === unit.id);
      return {
        ...unit,
        nota: change?.notaGerada ?? null,
        versoes: versionsByUnit[unit.id] ?? [],
      };
    });

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

    return {
      ...act,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      units: unitsWithNotes,
      history,
      attachments: act.attachments.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        url: a.url,
        nome: a.nome,
        downloadUrl: `/public/attachments/${a.id}/file`,
      })),
      changesAsAlterada: undefined,
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
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      hierarchyValid: this.validateHierarchy(act.units),
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

  async saveLegislativeEffects(actId: string, dto: SaveLegislativeEffectsDto) {
    const act = await this.ensureAct(actId);
    if (act.statusPublicacao === PublicationStatus.publicado) {
      throw new BadRequestException('Ato publicado — efeitos não podem ser alterados');
    }

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

    return this.getAdminById(actId);
  }

  async createAct(dto: CreateActDto) {
    const slug = buildActSlug(dto.tipo, dto.ano, dto.numero);
    const existing = await this.prisma.normativeAct.findFirst({
      where: { OR: [{ slug }, { tipo: dto.tipo, numero: dto.numero, ano: dto.ano }] },
    });
    if (existing) {
      throw new ConflictException('Já existe um ato com este tipo, número e ano');
    }

    const act = await this.prisma.normativeAct.create({
      data: {
        tipo: dto.tipo,
        numero: dto.numero,
        ano: dto.ano,
        ementa: dto.ementa,
        assunto: dto.assunto,
        dataAto: dto.dataAto ? new Date(dto.dataAto) : undefined,
        dataPublicacao: dto.dataPublicacao ? new Date(dto.dataPublicacao) : undefined,
        orgaoOrigem: dto.orgaoOrigem,
        autoridadeSignataria: dto.autoridadeSignataria,
        palavrasChave: dto.palavrasChave ?? [],
        slug,
        statusPublicacao: PublicationStatus.rascunho,
        situacao: ActSituacao.vigente,
        units: {
          create: [
            {
              tipoUnidade: UnitType.ementa,
              texto: dto.ementa,
              ordem: 0,
              status: UnitStatus.vigente,
            },
          ],
        },
      },
      include: { units: { orderBy: { ordem: 'asc' } } },
    });

    await this.createVersionForUnit(act.units[0].id, act.units[0].texto, act.id, act.dataAto);

    return { ...act, codigo: formatActCode(act.tipo, act.numero, act.ano), hierarchyValid: true };
  }

  async updateAct(id: string, dto: UpdateActDto) {
    await this.ensureAct(id);
    const act = await this.prisma.normativeAct.update({
      where: { id },
      data: {
        ...(dto.ementa !== undefined && { ementa: dto.ementa }),
        ...(dto.assunto !== undefined && { assunto: dto.assunto }),
        ...(dto.situacao !== undefined && { situacao: dto.situacao }),
        ...(dto.dataAto !== undefined && { dataAto: new Date(dto.dataAto) }),
        ...(dto.dataPublicacao !== undefined && {
          dataPublicacao: new Date(dto.dataPublicacao),
        }),
        ...(dto.orgaoOrigem !== undefined && { orgaoOrigem: dto.orgaoOrigem }),
        ...(dto.autoridadeSignataria !== undefined && {
          autoridadeSignataria: dto.autoridadeSignataria,
        }),
        ...(dto.palavrasChave !== undefined && { palavrasChave: dto.palavrasChave }),
        ...(dto.observacoesInternas !== undefined && {
          observacoesInternas: dto.observacoesInternas,
        }),
      },
      include: { units: { orderBy: { ordem: 'asc' } } },
    });
    return {
      ...act,
      codigo: formatActCode(act.tipo, act.numero, act.ano),
      hierarchyValid: this.validateHierarchy(act.units),
    };
  }

  async saveUnits(actId: string, dto: SaveUnitsDto) {
    const act = await this.ensureAct(actId);
    if (act.statusPublicacao === PublicationStatus.publicado) {
      throw new BadRequestException('Ato publicado — crie uma nova revisão em vez de editar diretamente');
    }

    const sorted = [...dto.units].sort((a, b) => a.ordem - b.ordem);
    const existingUnits = await this.prisma.normativeUnit.findMany({ where: { actId } });
    const existingById = new Map(existingUnits.map((u) => [u.id, u]));

    await this.prisma.$transaction(async (tx) => {
      for (const input of sorted) {
        if (input.id) {
          const prev = existingById.get(input.id);
          if (!prev) continue;
          if (prev.texto !== input.texto) {
            await tx.normativeVersion.updateMany({
              where: { unitId: input.id, validoAte: null },
              data: { validoAte: new Date() },
            });
            await tx.normativeVersion.create({
              data: {
                unitId: input.id,
                texto: input.texto,
                validoDe: new Date(),
                origemActId: actId,
              },
            });
          }
          await tx.normativeUnit.update({
            where: { id: input.id },
            data: {
              texto: input.texto,
              ordem: input.ordem,
              identificacao: input.identificacao,
              tipoUnidade: input.tipoUnidade,
              parentUnitId: input.parentUnitId ?? null,
            },
          });
        } else {
          const created = await tx.normativeUnit.create({
            data: {
              actId,
              tipoUnidade: input.tipoUnidade,
              identificacao: input.identificacao,
              texto: input.texto,
              ordem: input.ordem,
              parentUnitId: input.parentUnitId ?? null,
              status: UnitStatus.vigente,
              origemActId: actId,
            },
          });
          await tx.normativeVersion.create({
            data: {
              unitId: created.id,
              texto: input.texto,
              validoDe: new Date(),
              origemActId: actId,
            },
          });
        }
      }
    });

    return this.getAdminById(actId);
  }

  async addUnit(actId: string, dto: AddUnitDto) {
    const act = await this.ensureAct(actId);
    const existing = [...act.units].sort((a, b) => a.ordem - b.ordem);

    if (dto.parentUnitId) {
      const parent = existing.find((u) => u.id === dto.parentUnitId);
      if (!parent) throw new BadRequestException('Dispositivo pai não encontrado');
    }

    const insertOrdem = this.nextOrdemAfterParent(existing, dto.parentUnitId ?? null);

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

      const unit = await tx.normativeUnit.create({
        data: {
          actId,
          tipoUnidade: dto.tipoUnidade,
          identificacao:
            dto.identificacao ??
            defaultIdentificacao(dto.tipoUnidade, existing, dto.parentUnitId ?? null),
          texto: dto.texto ?? '',
          ordem: insertOrdem,
          parentUnitId: dto.parentUnitId ?? null,
          status: UnitStatus.vigente,
          origemActId: actId,
        },
      });

      await tx.normativeVersion.create({
        data: {
          unitId: unit.id,
          texto: unit.texto,
          validoDe: act.dataAto ?? new Date(),
          origemActId: actId,
        },
      });
    });

    return this.getAdminById(actId);
  }

  async submitForReview(id: string) {
    const act = await this.ensureAct(id);
    if (act.statusPublicacao === PublicationStatus.publicado) {
      throw new BadRequestException('Ato já publicado');
    }
    if (act.units.length === 0) {
      throw new BadRequestException('Adicione ao menos um dispositivo antes de enviar');
    }

    await this.prisma.normativeAct.update({
      where: { id },
      data: { statusPublicacao: PublicationStatus.em_revisao },
    });
    return this.getAdminById(id);
  }

  async publish(id: string) {
    const act = await this.ensureAct(id);
    if (act.units.length === 0) {
      throw new BadRequestException('Ato sem dispositivos não pode ser publicado');
    }

    await this.prisma.normativeAct.update({
      where: { id },
      data: { statusPublicacao: PublicationStatus.publicado },
    });
    await this.consolidation.applyPendingEffectsForAct(id);
    await refreshSearchVector(this.prisma, id);
    return this.getAdminById(id);
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

  async restoreUnitVersion(actId: string, unitId: string, versionId: string) {
    const act = await this.ensureAct(actId);
    if (act.statusPublicacao === PublicationStatus.publicado) {
      throw new BadRequestException('Ato publicado — não é possível restaurar versões');
    }

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
