import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActSituacao,
  ChangeOrigin,
  ChangeType,
  EditorialStage,
  InclusaoPosicionamento,
  UnitStatus,
  UnitType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatActCode } from '../normative-acts/normative-acts.utils';
import { refreshSearchVector } from '../normative-acts/search.utils';
import {
  ApplyConsolidationDto,
  ConsolidationPreviewDto,
  CorrectConsolidationLinkDto,
  ListConsolidationLinksQuery,
  RegisterExternalEffectDto,
} from './consolidation.dto';
import {
  generateConsolidationNote,
  generateExternalConsolidationNote,
} from './consolidation-notes.utils';
import { computeInclusionPlacement } from './inclusion-placement.utils';

@Injectable()
export class ConsolidationService {
  constructor(private readonly prisma: PrismaService) {}

  async listActs() {
    const acts = await this.prisma.normativeAct.findMany({
      orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
      select: {
        id: true,
        tipo: true,
        numero: true,
        ano: true,
        ementa: true,
        slug: true,
        statusPublicacao: true,
        etapaEditorial: true,
      },
    });
    return acts.map((a) => ({
      ...a,
      codigo: formatActCode(a.tipo, a.numero, a.ano),
    }));
  }

  async listUnits(actId: string) {
    const act = await this.prisma.normativeAct.findUnique({ where: { id: actId } });
    if (!act) throw new NotFoundException('Ato não encontrado');

    const units = await this.prisma.normativeUnit.findMany({
      where: {
        actId,
        tipoUnidade: {
          notIn: [UnitType.texto_simples, UnitType.preambulo, UnitType.considerando],
        },
      },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        identificacao: true,
        tipoUnidade: true,
        texto: true,
        status: true,
        ordem: true,
        parentUnitId: true,
      },
    });
    return units;
  }

  async listLinks(query: ListConsolidationLinksQuery) {
    const changes = await this.prisma.normativeChange.findMany({
      where: {
        ...(query.normaAlteradaActId
          ? { normaAlteradaActId: query.normaAlteradaActId }
          : {}),
        ...(query.normaAlteradoraActId
          ? { normaAlteradoraActId: query.normaAlteradoraActId }
          : {}),
        ...(query.incompleteOnly ? { incomplete: true } : {}),
      },
      orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
      include: {
        normaAlteradora: {
          select: { id: true, tipo: true, numero: true, ano: true, slug: true },
        },
        normaAlterada: {
          select: { id: true, tipo: true, numero: true, ano: true, slug: true },
        },
        sourceUnit: { select: { id: true, identificacao: true, actId: true } },
        unit: { select: { id: true, identificacao: true } },
        externalSource: true,
        autor: { select: { id: true, nome: true, email: true } },
      },
    });

    return changes.map((c) => ({
      id: c.id,
      origem: c.origem,
      incomplete: c.incomplete,
      tipoAlteracao: c.tipoAlteracao,
      data: c.data.toISOString().slice(0, 10),
      notaGerada: c.notaGerada,
      fundamento: c.fundamento,
      normaAlteradora: c.normaAlteradora
        ? {
            id: c.normaAlteradora.id,
            codigo: formatActCode(
              c.normaAlteradora.tipo,
              c.normaAlteradora.numero,
              c.normaAlteradora.ano,
            ),
            slug: c.normaAlteradora.slug,
          }
        : null,
      normaAlterada: {
        id: c.normaAlterada.id,
        codigo: formatActCode(
          c.normaAlterada.tipo,
          c.normaAlterada.numero,
          c.normaAlterada.ano,
        ),
        slug: c.normaAlterada.slug,
      },
      sourceUnit: c.sourceUnit
        ? { id: c.sourceUnit.id, identificacao: c.sourceUnit.identificacao }
        : null,
      targetUnit: c.unit ? { id: c.unit.id, identificacao: c.unit.identificacao } : null,
      externalSource: c.externalSource
        ? {
            id: c.externalSource.id,
            tipo: c.externalSource.tipo,
            numero: c.externalSource.numero,
            ano: c.externalSource.ano,
            emissor: c.externalSource.emissor,
            descricao: c.externalSource.descricao,
            url: c.externalSource.url,
            processo: c.externalSource.processo,
            tribunal: c.externalSource.tribunal,
          }
        : null,
      autor: c.autor ? { id: c.autor.id, nome: c.autor.nome } : null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async correctLink(changeId: string, dto: CorrectConsolidationLinkDto, autorId?: string | null) {
    const change = await this.prisma.normativeChange.findUnique({
      where: { id: changeId },
      include: {
        normaAlteradora: true,
        sourceUnit: true,
      },
    });
    if (!change) throw new NotFoundException('Vínculo não encontrado');
    if (change.origem !== ChangeOrigin.interna) {
      throw new BadRequestException('Correção de elemento fonte aplica-se apenas a vínculos internos');
    }
    if (!change.normaAlteradoraActId) {
      throw new BadRequestException('Vínculo interno sem norma alteradora');
    }

    const sourceUnit = await this.prisma.normativeUnit.findFirst({
      where: { id: dto.sourceUnitId, actId: change.normaAlteradoraActId },
    });
    if (!sourceUnit) {
      throw new BadRequestException('Elemento alterador não pertence à norma alteradora deste vínculo');
    }

    const notaGerada =
      dto.regenerateNote !== false && change.normaAlteradora
        ? generateConsolidationNote(change.tipoAlteracao, change.normaAlteradora, sourceUnit)
        : change.notaGerada;

    const updated = await this.prisma.normativeChange.update({
      where: { id: changeId },
      data: {
        sourceUnitId: dto.sourceUnitId,
        incomplete: false,
        notaGerada,
        autorId: autorId ?? change.autorId,
      },
      include: {
        normaAlteradora: {
          select: { id: true, tipo: true, numero: true, ano: true, slug: true },
        },
        normaAlterada: {
          select: { id: true, tipo: true, numero: true, ano: true, slug: true },
        },
        sourceUnit: { select: { id: true, identificacao: true } },
        unit: { select: { id: true, identificacao: true } },
      },
    });

    if (updated.unitId && notaGerada) {
      await refreshSearchVector(this.prisma, updated.normaAlteradaActId);
    }

    return updated;
  }

  async preview(dto: ConsolidationPreviewDto) {
    const { alteradora, alterada, sourceUnit, unit, changeDate } = await this.loadInternalContext(dto);

    const textoAnterior = this.resolveTextoAnterior(dto.tipoAlteracao, unit);
    const notaGerada = generateConsolidationNote(dto.tipoAlteracao, alteradora, sourceUnit);

    return {
      normaAlteradora: {
        id: alteradora.id,
        codigo: formatActCode(alteradora.tipo, alteradora.numero, alteradora.ano),
      },
      sourceUnit: {
        id: sourceUnit.id,
        identificacao: sourceUnit.identificacao,
      },
      normaAlterada: {
        id: alterada.id,
        codigo: formatActCode(alterada.tipo, alterada.numero, alterada.ano),
      },
      dispositivo: unit?.identificacao ?? dto.identificacao ?? null,
      tipoAlteracao: dto.tipoAlteracao,
      textoAnterior,
      textoNovo: dto.textoNovo ?? null,
      notaGerada,
      data: changeDate.toISOString().slice(0, 10),
    };
  }

  /** Consolidação interna manual bloqueada — use efeitos legislativos no editor. */
  async apply(_dto: ApplyConsolidationDto, _autorId?: string | null) {
    throw new BadRequestException(
      'Consolidação interna deve ser registrada via Efeitos Legislativos no editor do ato alterador. ' +
        'Use esta tela apenas para auditoria, correção de vínculos incompletos ou registro de efeitos de fonte externa.',
    );
  }

  async registerExternalEffect(dto: RegisterExternalEffectDto, autorId?: string | null) {
    const alterada = await this.prisma.normativeAct.findUnique({
      where: { id: dto.normaAlteradaActId },
    });
    if (!alterada) throw new NotFoundException('Norma alterada não encontrada');

    let unit = null;
    if (dto.unitId) {
      unit = await this.prisma.normativeUnit.findFirst({
        where: { id: dto.unitId, actId: alterada.id },
      });
      if (!unit) throw new NotFoundException('Dispositivo não encontrado na norma alterada');
    } else if (dto.tipoAlteracao !== ChangeType.inclusao) {
      throw new BadRequestException('Dispositivo afetado é obrigatório para este tipo de efeito');
    }

    const changeDate = dto.data ? new Date(dto.data) : new Date();

    const externalSource = await this.prisma.externalLegislativeSource.create({
      data: {
        tipo: dto.source.tipo,
        numero: dto.source.numero,
        ano: dto.source.ano,
        emissor: dto.source.emissor.trim(),
        data: dto.source.data ? new Date(dto.source.data) : null,
        descricao: dto.source.descricao.trim(),
        url: dto.source.url?.trim() || null,
        arquivoUrl: dto.source.arquivoUrl?.trim() || null,
        processo: dto.source.processo?.trim() || null,
        tribunal: dto.source.tribunal?.trim() || null,
      },
    });

    const notaGerada = generateExternalConsolidationNote(dto.tipoAlteracao, {
      ...externalSource,
      descricao: externalSource.descricao,
    });

    if (dto.tipoAlteracao === ChangeType.inclusao) {
      if (!dto.textoNovo?.trim()) {
        throw new BadRequestException('Texto do novo dispositivo é obrigatório');
      }
      return this.applyExternalInclusao(
        dto,
        alterada,
        externalSource.id,
        notaGerada,
        changeDate,
        autorId,
      );
    }

    if (!unit) throw new BadRequestException('Dispositivo afetado é obrigatório');

    if (unit.status === UnitStatus.revogada) {
      throw new BadRequestException('Dispositivo já revogado');
    }

    if (dto.tipoAlteracao === ChangeType.alteracao_redacao) {
      if (!dto.textoNovo?.trim()) {
        throw new BadRequestException('Nova redação é obrigatória');
      }
      return this.applyExternalAlteracao(
        dto,
        unit,
        alterada,
        externalSource.id,
        notaGerada,
        changeDate,
        autorId,
      );
    }

    return this.applyExternalRevogacao(
      dto,
      unit,
      alterada,
      externalSource.id,
      notaGerada,
      changeDate,
      unit.texto,
      autorId,
    );
  }

  async applyInternal(
    dto: ApplyConsolidationDto,
    sourceUnitId: string,
    autorId?: string | null,
  ) {
    const { alteradora, alterada, sourceUnit, unit, changeDate } = await this.loadInternalContext({
      ...dto,
      sourceUnitId,
    });

    const notaGerada = generateConsolidationNote(dto.tipoAlteracao, alteradora, sourceUnit);
    const textoAnterior = unit?.texto ?? null;

    if (dto.tipoAlteracao === ChangeType.inclusao) {
      if (!dto.textoNovo?.trim()) {
        throw new BadRequestException('Texto do novo dispositivo é obrigatório');
      }
      if (dto.referenciaUnitId && !dto.posicionamento) {
        throw new BadRequestException('Posicionamento é obrigatório quando há dispositivo de referência');
      }
      return this.applyInclusao(
        dto,
        alteradora,
        alterada,
        sourceUnit,
        notaGerada,
        changeDate,
        autorId,
      );
    }

    if (!unit) throw new BadRequestException('Dispositivo obrigatório');

    if (unit.status === UnitStatus.revogada) {
      throw new BadRequestException('Dispositivo já revogado');
    }

    if (dto.tipoAlteracao === ChangeType.alteracao_redacao) {
      if (!dto.textoNovo?.trim()) {
        throw new BadRequestException('Nova redação é obrigatória');
      }
      return this.applyAlteracao(
        dto,
        unit,
        alteradora,
        alterada,
        sourceUnit,
        notaGerada,
        changeDate,
        autorId,
      );
    }

    return this.applyRevogacao(
      dto,
      unit,
      alteradora,
      alterada,
      sourceUnit,
      notaGerada,
      changeDate,
      textoAnterior,
      autorId,
    );
  }

  private async applyAlteracao(
    dto: ApplyConsolidationDto,
    unit: { id: string; texto: string },
    alteradora: { id: string; dataAto: Date | null },
    alterada: { id: string },
    sourceUnit: { id: string; identificacao: string | null },
    notaGerada: string,
    changeDate: Date,
    autorId?: string | null,
  ) {
    const textoAnterior = unit.texto;

    await this.prisma.$transaction(async (tx) => {
      await tx.normativeVersion.updateMany({
        where: { unitId: unit.id, validoAte: null },
        data: { validoAte: changeDate },
      });

      await tx.normativeVersion.create({
        data: {
          unitId: unit.id,
          texto: dto.textoNovo!,
          validoDe: changeDate,
          origemActId: alteradora.id,
        },
      });

      await tx.normativeUnit.update({
        where: { id: unit.id },
        data: {
          texto: dto.textoNovo!,
          status: UnitStatus.alterada,
          alteradoPorActId: alteradora.id,
          dataAlteracao: changeDate,
        },
      });

      await tx.normativeChange.create({
        data: {
          normaAlteradoraActId: alteradora.id,
          normaAlteradaActId: alterada.id,
          sourceUnitId: sourceUnit.id,
          unitId: unit.id,
          tipoAlteracao: ChangeType.alteracao_redacao,
          origem: ChangeOrigin.interna,
          incomplete: false,
          textoAnterior,
          textoNovo: dto.textoNovo!,
          notaGerada,
          fundamento: dto.fundamento,
          data: changeDate,
          autorId,
        },
      });
    });

    await this.recalculateActSituacao(alterada.id);
    await refreshSearchVector(this.prisma, alterada.id);

    return this.preview({ ...dto, sourceUnitId: sourceUnit.id });
  }

  private async applyRevogacao(
    dto: ApplyConsolidationDto,
    unit: { id: string; texto: string },
    alteradora: { id: string },
    alterada: { id: string },
    sourceUnit: { id: string; identificacao: string | null },
    notaGerada: string,
    changeDate: Date,
    textoAnterior: string | null,
    autorId?: string | null,
  ) {
    const tipo =
      dto.tipoAlteracao === ChangeType.revogacao_total
        ? ChangeType.revogacao_total
        : ChangeType.revogacao_parcial;

    await this.prisma.$transaction(async (tx) => {
      await tx.normativeVersion.updateMany({
        where: { unitId: unit.id, validoAte: null },
        data: { validoAte: changeDate },
      });

      await tx.normativeUnit.update({
        where: { id: unit.id },
        data: {
          status:
            dto.tipoAlteracao === ChangeType.revogacao_total
              ? UnitStatus.revogada
              : UnitStatus.revogada_parcialmente,
          alteradoPorActId: alteradora.id,
          dataAlteracao: changeDate,
        },
      });

      await tx.normativeChange.create({
        data: {
          normaAlteradoraActId: alteradora.id,
          normaAlteradaActId: alterada.id,
          sourceUnitId: sourceUnit.id,
          unitId: unit.id,
          tipoAlteracao: tipo,
          origem: ChangeOrigin.interna,
          incomplete: false,
          textoAnterior,
          notaGerada,
          fundamento: dto.fundamento,
          data: changeDate,
          autorId,
        },
      });
    });

    await this.recalculateActSituacao(alterada.id);
    await refreshSearchVector(this.prisma, alterada.id);

    return this.preview({ ...dto, sourceUnitId: sourceUnit.id });
  }

  private async applyInclusao(
    dto: ApplyConsolidationDto,
    alteradora: { id: string; dataAto: Date | null },
    alterada: { id: string },
    sourceUnit: { id: string; identificacao: string | null },
    notaGerada: string,
    changeDate: Date,
    autorId?: string | null,
  ) {
    const existingUnits = await this.prisma.normativeUnit.findMany({
      where: { actId: alterada.id },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true, parentUnitId: true, tipoUnidade: true },
    });

    const tipoUnidade = dto.tipoDispositivoIncluido ?? UnitType.artigo;
    let insertOrdem: number;
    let parentUnitId: string | null = null;

    if (dto.referenciaUnitId && dto.posicionamento) {
      const ref = existingUnits.find((u) => u.id === dto.referenciaUnitId);
      if (!ref) {
        throw new BadRequestException('Dispositivo de referência não encontrado na norma alterada');
      }
      const placement = computeInclusionPlacement(
        existingUnits,
        dto.referenciaUnitId,
        dto.posicionamento,
      );
      insertOrdem = placement.insertOrdem;
      parentUnitId = placement.parentUnitId;
    } else {
      const maxOrdem = existingUnits.reduce((m, u) => Math.max(m, u.ordem), -1);
      insertOrdem = maxOrdem + 1;
    }

    const identificacao =
      dto.identificacao?.trim() ||
      this.defaultIdentificacao(tipoUnidade, existingUnits.length + 1);

    let createdUnitId = '';

    await this.prisma.$transaction(async (tx) => {
      const toShift = existingUnits.filter((u) => u.ordem >= insertOrdem);
      for (const u of toShift.sort((a, b) => b.ordem - a.ordem)) {
        await tx.normativeUnit.update({
          where: { id: u.id },
          data: { ordem: u.ordem + 1 },
        });
      }

      const created = await tx.normativeUnit.create({
        data: {
          actId: alterada.id,
          tipoUnidade,
          identificacao,
          texto: dto.textoNovo!,
          ordem: insertOrdem,
          parentUnitId,
          status: UnitStatus.incluida,
          origemActId: alterada.id,
          alteradoPorActId: alteradora.id,
          dataAlteracao: changeDate,
        },
      });
      createdUnitId = created.id;

      await tx.normativeVersion.create({
        data: {
          unitId: created.id,
          texto: dto.textoNovo!,
          validoDe: changeDate,
          origemActId: alteradora.id,
        },
      });

      await tx.normativeChange.create({
        data: {
          normaAlteradoraActId: alteradora.id,
          normaAlteradaActId: alterada.id,
          sourceUnitId: sourceUnit.id,
          unitId: created.id,
          tipoAlteracao: ChangeType.inclusao,
          origem: ChangeOrigin.interna,
          incomplete: false,
          textoNovo: dto.textoNovo!,
          notaGerada,
          fundamento: dto.fundamento,
          data: changeDate,
          autorId,
        },
      });
    });

    await this.recalculateActSituacao(alterada.id);
    await refreshSearchVector(this.prisma, alterada.id);

    return this.preview({ ...dto, sourceUnitId: sourceUnit.id, unitId: createdUnitId });
  }

  private async applyExternalAlteracao(
    dto: RegisterExternalEffectDto,
    unit: { id: string; texto: string },
    alterada: { id: string },
    externalSourceId: string,
    notaGerada: string,
    changeDate: Date,
    autorId?: string | null,
  ) {
    const textoAnterior = unit.texto;

    await this.prisma.$transaction(async (tx) => {
      await tx.normativeVersion.updateMany({
        where: { unitId: unit.id, validoAte: null },
        data: { validoAte: changeDate },
      });

      await tx.normativeVersion.create({
        data: {
          unitId: unit.id,
          texto: dto.textoNovo!,
          validoDe: changeDate,
        },
      });

      await tx.normativeUnit.update({
        where: { id: unit.id },
        data: {
          texto: dto.textoNovo!,
          status: UnitStatus.alterada,
          dataAlteracao: changeDate,
        },
      });

      await tx.normativeChange.create({
        data: {
          normaAlteradaActId: alterada.id,
          unitId: unit.id,
          externalSourceId,
          tipoAlteracao: ChangeType.alteracao_redacao,
          origem: ChangeOrigin.externa,
          incomplete: false,
          textoAnterior,
          textoNovo: dto.textoNovo!,
          notaGerada,
          fundamento: dto.fundamento,
          data: changeDate,
          autorId,
        },
      });
    });

    await this.recalculateActSituacao(alterada.id);
    await refreshSearchVector(this.prisma, alterada.id);

    return { success: true, notaGerada };
  }

  private async applyExternalRevogacao(
    dto: RegisterExternalEffectDto,
    unit: { id: string; texto: string },
    alterada: { id: string },
    externalSourceId: string,
    notaGerada: string,
    changeDate: Date,
    textoAnterior: string | null,
    autorId?: string | null,
  ) {
    const tipo =
      dto.tipoAlteracao === ChangeType.revogacao_total
        ? ChangeType.revogacao_total
        : ChangeType.revogacao_parcial;

    await this.prisma.$transaction(async (tx) => {
      await tx.normativeVersion.updateMany({
        where: { unitId: unit.id, validoAte: null },
        data: { validoAte: changeDate },
      });

      await tx.normativeUnit.update({
        where: { id: unit.id },
        data: {
          status:
            dto.tipoAlteracao === ChangeType.revogacao_total
              ? UnitStatus.revogada
              : UnitStatus.revogada_parcialmente,
          dataAlteracao: changeDate,
        },
      });

      await tx.normativeChange.create({
        data: {
          normaAlteradaActId: alterada.id,
          unitId: unit.id,
          externalSourceId,
          tipoAlteracao: tipo,
          origem: ChangeOrigin.externa,
          incomplete: false,
          textoAnterior,
          notaGerada,
          fundamento: dto.fundamento,
          data: changeDate,
          autorId,
        },
      });
    });

    await this.recalculateActSituacao(alterada.id);
    await refreshSearchVector(this.prisma, alterada.id);

    return { success: true, notaGerada };
  }

  private async applyExternalInclusao(
    dto: RegisterExternalEffectDto,
    alterada: { id: string },
    externalSourceId: string,
    notaGerada: string,
    changeDate: Date,
    autorId?: string | null,
  ) {
    const existingUnits = await this.prisma.normativeUnit.findMany({
      where: { actId: alterada.id },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true, parentUnitId: true, tipoUnidade: true },
    });

    const tipoUnidade = dto.tipoDispositivoIncluido ?? UnitType.artigo;
    let insertOrdem: number;
    let parentUnitId: string | null = null;

    if (dto.referenciaUnitId && dto.posicionamento) {
      const ref = existingUnits.find((u) => u.id === dto.referenciaUnitId);
      if (!ref) {
        throw new BadRequestException('Dispositivo de referência não encontrado na norma alterada');
      }
      const placement = computeInclusionPlacement(
        existingUnits,
        dto.referenciaUnitId,
        dto.posicionamento,
      );
      insertOrdem = placement.insertOrdem;
      parentUnitId = placement.parentUnitId;
    } else {
      const maxOrdem = existingUnits.reduce((m, u) => Math.max(m, u.ordem), -1);
      insertOrdem = maxOrdem + 1;
    }

    const identificacao =
      dto.identificacao?.trim() ||
      this.defaultIdentificacao(tipoUnidade, existingUnits.length + 1);

    await this.prisma.$transaction(async (tx) => {
      const toShift = existingUnits.filter((u) => u.ordem >= insertOrdem);
      for (const u of toShift.sort((a, b) => b.ordem - a.ordem)) {
        await tx.normativeUnit.update({
          where: { id: u.id },
          data: { ordem: u.ordem + 1 },
        });
      }

      const created = await tx.normativeUnit.create({
        data: {
          actId: alterada.id,
          tipoUnidade,
          identificacao,
          texto: dto.textoNovo!,
          ordem: insertOrdem,
          parentUnitId,
          status: UnitStatus.incluida,
          origemActId: alterada.id,
          dataAlteracao: changeDate,
        },
      });

      await tx.normativeVersion.create({
        data: {
          unitId: created.id,
          texto: dto.textoNovo!,
          validoDe: changeDate,
        },
      });

      await tx.normativeChange.create({
        data: {
          normaAlteradaActId: alterada.id,
          unitId: created.id,
          externalSourceId,
          tipoAlteracao: ChangeType.inclusao,
          origem: ChangeOrigin.externa,
          incomplete: false,
          textoNovo: dto.textoNovo!,
          notaGerada,
          fundamento: dto.fundamento,
          data: changeDate,
          autorId,
        },
      });
    });

    await this.recalculateActSituacao(alterada.id);
    await refreshSearchVector(this.prisma, alterada.id);

    return { success: true, notaGerada };
  }

  private defaultIdentificacao(tipo: UnitType, seq: number): string {
    switch (tipo) {
      case UnitType.artigo:
        return `Art. ${seq}º`;
      case UnitType.paragrafo:
        return `§ ${seq}º`;
      case UnitType.inciso:
        return 'I';
      case UnitType.capitulo:
        return `CAPÍTULO ${seq}`;
      case UnitType.titulo:
        return `TÍTULO ${seq}`;
      default:
        return '';
    }
  }

  private async loadInternalContext(dto: ConsolidationPreviewDto) {
    if (!dto.sourceUnitId) {
      throw new BadRequestException('Elemento alterador (sourceUnitId) é obrigatório para consolidação interna');
    }

    const [alteradora, alterada, sourceUnit] = await Promise.all([
      this.prisma.normativeAct.findUnique({ where: { id: dto.normaAlteradoraActId } }),
      this.prisma.normativeAct.findUnique({ where: { id: dto.normaAlteradaActId } }),
      this.prisma.normativeUnit.findFirst({
        where: { id: dto.sourceUnitId, actId: dto.normaAlteradoraActId },
      }),
    ]);

    if (!alteradora) throw new NotFoundException('Norma alteradora não encontrada');
    if (!alterada) throw new NotFoundException('Norma alterada não encontrada');
    if (!sourceUnit) {
      throw new NotFoundException('Elemento alterador não encontrado na norma alteradora');
    }
    if (alteradora.id === alterada.id) {
      throw new BadRequestException('Norma alteradora e alterada devem ser diferentes');
    }

    let unit = null;
    if (dto.unitId) {
      unit = await this.prisma.normativeUnit.findFirst({
        where: { id: dto.unitId, actId: alterada.id },
      });
      if (!unit) throw new NotFoundException('Dispositivo não encontrado na norma alterada');
    } else if (dto.tipoAlteracao !== ChangeType.inclusao) {
      throw new BadRequestException('Dispositivo obrigatório para este tipo de alteração');
    }

    const changeDate = dto.data
      ? new Date(dto.data)
      : alteradora.dataAto ?? alteradora.dataPublicacao ?? new Date();

    return { alteradora, alterada, sourceUnit, unit, changeDate };
  }

  private resolveTextoAnterior(
    tipo: ChangeType,
    unit: { texto: string } | null,
  ): string | null {
    if (tipo === ChangeType.inclusao) {
      return '(dispositivo não constava do texto original)';
    }
    return unit?.texto ?? null;
  }

  async applyPendingEffectsForAct(alteradoraActId: string) {
    const alteradora = await this.prisma.normativeAct.findUnique({ where: { id: alteradoraActId } });
    if (!alteradora) return;

    const effects = await this.prisma.legislativeEffect.findMany({
      where: {
        sourceUnit: { actId: alteradoraActId },
        appliedAt: null,
      },
      include: {
        sourceUnit: { select: { id: true, identificacao: true } },
        targetUnit: true,
        redacaoUnit: true,
      },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    });

    for (const effect of effects) {
      if (!effect.sourceUnitId) {
        throw new BadRequestException(
          'Efeito legislativo sem elemento alterador — corrija no editor antes de publicar',
        );
      }

      const textoNovo =
        effect.textoNovo?.trim() || effect.redacaoUnit?.texto?.trim() || undefined;
      const changeType = effect.tipoEfeito as unknown as ChangeType;

      if (changeType === ChangeType.renumeracao) {
        if (!effect.targetUnitId || !effect.novaIdentificacao?.trim()) continue;
        const notaGerada = generateConsolidationNote(
          ChangeType.renumeracao,
          alteradora,
          effect.sourceUnit,
        );
        await this.prisma.$transaction(async (tx) => {
          await tx.normativeUnit.update({
            where: { id: effect.targetUnitId! },
            data: {
              identificacao: effect.novaIdentificacao!.trim(),
              alteradoPorActId: alteradoraActId,
              dataAlteracao: effect.dataVigencia,
            },
          });
          await tx.normativeChange.create({
            data: {
              normaAlteradoraActId: alteradoraActId,
              normaAlteradaActId: effect.normaAlteradaActId,
              sourceUnitId: effect.sourceUnitId,
              unitId: effect.targetUnitId,
              tipoAlteracao: ChangeType.renumeracao,
              origem: ChangeOrigin.interna,
              incomplete: false,
              notaGerada,
              fundamento: effect.observacoes,
              data: effect.dataVigencia,
            },
          });
          await tx.legislativeEffect.update({
            where: { id: effect.id },
            data: { appliedAt: new Date() },
          });
        });
        await this.recalculateActSituacao(effect.normaAlteradaActId);
        continue;
      }

      const dto: ApplyConsolidationDto = {
        normaAlteradoraActId: alteradoraActId,
        normaAlteradaActId: effect.normaAlteradaActId,
        sourceUnitId: effect.sourceUnitId,
        unitId: effect.targetUnitId ?? undefined,
        tipoAlteracao: changeType,
        textoNovo,
        fundamento: effect.observacoes ?? undefined,
        data: effect.dataVigencia.toISOString().slice(0, 10),
        identificacao: effect.novaIdentificacao ?? undefined,
        referenciaUnitId: effect.referenciaUnitId ?? undefined,
        posicionamento: effect.posicionamento ?? undefined,
        tipoDispositivoIncluido: effect.tipoDispositivoIncluido ?? undefined,
      };

      await this.applyInternal(dto, effect.sourceUnitId, null);
      await this.prisma.legislativeEffect.update({
        where: { id: effect.id },
        data: { appliedAt: new Date() },
      });
    }
  }

  private async recalculateActSituacao(actId: string) {
    const units = await this.prisma.normativeUnit.findMany({
      where: { actId, tipoUnidade: UnitType.artigo },
    });
    if (units.length === 0) return;

    const revoked = units.filter((u) => u.status === UnitStatus.revogada).length;
    const partial = units.filter((u) => u.status === UnitStatus.revogada_parcialmente).length;
    let situacao: ActSituacao = ActSituacao.vigente;

    if (revoked === units.length) {
      situacao = ActSituacao.revogado;
    } else if (revoked > 0 || partial > 0) {
      situacao = ActSituacao.parcialmente_revogado;
    } else if (units.some((u) => u.status === UnitStatus.alterada || u.status === UnitStatus.incluida)) {
      situacao = ActSituacao.alterado;
    }

    await this.prisma.normativeAct.update({
      where: { id: actId },
      data: { situacao },
    });
  }
}
