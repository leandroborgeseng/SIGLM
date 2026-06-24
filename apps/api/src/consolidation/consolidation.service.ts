import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActSituacao,
  ChangeType,
  UnitStatus,
  UnitType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatActCode } from '../normative-acts/normative-acts.utils';
import { refreshSearchVector } from '../normative-acts/search.utils';
import { ApplyConsolidationDto, ConsolidationPreviewDto } from './consolidation.dto';

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
      where: { actId },
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

  async preview(dto: ConsolidationPreviewDto) {
    const { alteradora, alterada, unit, changeDate } = await this.loadContext(dto);

    const textoAnterior = this.resolveTextoAnterior(dto.tipoAlteracao, unit);
    const notaGerada = this.generateNote(dto.tipoAlteracao, alteradora);

    return {
      normaAlteradora: {
        id: alteradora.id,
        codigo: formatActCode(alteradora.tipo, alteradora.numero, alteradora.ano),
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

  async apply(dto: ApplyConsolidationDto, autorId?: string | null) {
    const { alteradora, alterada, unit, changeDate } = await this.loadContext(dto);
    const notaGerada = this.generateNote(dto.tipoAlteracao, alteradora);
    const textoAnterior = unit?.texto ?? null;

    if (dto.tipoAlteracao === ChangeType.inclusao) {
      if (!dto.textoNovo?.trim()) {
        throw new BadRequestException('Texto do novo dispositivo é obrigatório');
      }
      return this.applyInclusao(dto, alteradora, alterada, notaGerada, changeDate, autorId);
    }

    if (!unit) throw new BadRequestException('Dispositivo obrigatório');

    if (unit.status === UnitStatus.revogada) {
      throw new BadRequestException('Dispositivo já revogado');
    }

    if (dto.tipoAlteracao === ChangeType.alteracao_redacao) {
      if (!dto.textoNovo?.trim()) {
        throw new BadRequestException('Nova redação é obrigatória');
      }
      return this.applyAlteracao(dto, unit, alteradora, alterada, notaGerada, changeDate, autorId);
    }

    return this.applyRevogacao(
      dto,
      unit,
      alteradora,
      alterada,
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
          unitId: unit.id,
          tipoAlteracao: ChangeType.alteracao_redacao,
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

    return this.preview(dto);
  }

  private async applyRevogacao(
    dto: ApplyConsolidationDto,
    unit: { id: string; texto: string },
    alteradora: { id: string },
    alterada: { id: string },
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
          unitId: unit.id,
          tipoAlteracao: tipo,
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

    return this.preview(dto);
  }

  private async applyInclusao(
    dto: ApplyConsolidationDto,
    alteradora: { id: string; dataAto: Date | null },
    alterada: { id: string },
    notaGerada: string,
    changeDate: Date,
    autorId?: string | null,
  ) {
    const maxOrdem = await this.prisma.normativeUnit.aggregate({
      where: { actId: alterada.id },
      _max: { ordem: true },
    });
    const ordem = (maxOrdem._max.ordem ?? -1) + 1;

    let createdUnitId = '';

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.normativeUnit.create({
        data: {
          actId: alterada.id,
          tipoUnidade: UnitType.artigo,
          identificacao: dto.identificacao ?? `Art. ${ordem}º`,
          texto: dto.textoNovo!,
          ordem,
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
          unitId: created.id,
          tipoAlteracao: ChangeType.inclusao,
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

    return this.preview({ ...dto, unitId: createdUnitId });
  }

  private async loadContext(dto: ConsolidationPreviewDto) {
    const [alteradora, alterada] = await Promise.all([
      this.prisma.normativeAct.findUnique({ where: { id: dto.normaAlteradoraActId } }),
      this.prisma.normativeAct.findUnique({ where: { id: dto.normaAlteradaActId } }),
    ]);

    if (!alteradora) throw new NotFoundException('Norma alteradora não encontrada');
    if (!alterada) throw new NotFoundException('Norma alterada não encontrada');
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

    return { alteradora, alterada, unit, changeDate };
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

  generateNote(
    tipo: ChangeType,
    alteradora: { tipo: Parameters<typeof formatActCode>[0]; numero: number; ano: number },
  ): string {
    const codigo = formatActCode(alteradora.tipo, alteradora.numero, alteradora.ano);
    switch (tipo) {
      case ChangeType.alteracao_redacao:
        return `Redação dada pela ${codigo}`;
      case ChangeType.inclusao:
        return `Incluído pela ${codigo}`;
      case ChangeType.revogacao_parcial:
      case ChangeType.revogacao_total:
        return `Revogado pelo ${codigo}`;
      case ChangeType.renumeracao:
        return `Renumeração pela ${codigo}`;
      default:
        return codigo;
    }
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
        targetUnit: true,
        redacaoUnit: true,
      },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    });

    for (const effect of effects) {
      const textoNovo =
        effect.textoNovo?.trim() || effect.redacaoUnit?.texto?.trim() || undefined;
      const changeType = effect.tipoEfeito as unknown as ChangeType;

      if (changeType === ChangeType.renumeracao) {
        if (!effect.targetUnitId || !effect.novaIdentificacao?.trim()) continue;
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
              unitId: effect.targetUnitId,
              tipoAlteracao: ChangeType.renumeracao,
              notaGerada: effect.observacoes ?? 'Renumeração',
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
        unitId: effect.targetUnitId ?? undefined,
        tipoAlteracao: changeType,
        textoNovo,
        fundamento: effect.observacoes ?? undefined,
        data: effect.dataVigencia.toISOString().slice(0, 10),
        identificacao: effect.novaIdentificacao ?? undefined,
      };

      await this.apply(dto, null);
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
