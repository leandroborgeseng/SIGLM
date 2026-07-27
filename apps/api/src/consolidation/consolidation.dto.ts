import { ActType, ChangeType, InclusaoPosicionamento, UnitType } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ConsolidationPreviewDto {
  @IsUUID()
  normaAlteradoraActId!: string;

  @IsUUID()
  normaAlteradaActId!: string;

  @IsUUID()
  sourceUnitId!: string;

  @IsEnum(ChangeType)
  tipoAlteracao!: ChangeType;

  @ValidateIf((o) => o.tipoAlteracao !== ChangeType.inclusao)
  @IsUUID()
  unitId?: string;

  @ValidateIf(
    (o) =>
      o.tipoAlteracao === ChangeType.alteracao_redacao ||
      o.tipoAlteracao === ChangeType.inclusao,
  )
  @IsString()
  @MinLength(1)
  textoNovo?: string;

  @IsOptional()
  @IsString()
  identificacao?: string;

  @IsOptional()
  @IsDateString()
  data?: string;

  @ValidateIf((o) => o.tipoAlteracao === ChangeType.inclusao)
  @IsOptional()
  @IsUUID()
  referenciaUnitId?: string;

  @ValidateIf((o) => o.tipoAlteracao === ChangeType.inclusao)
  @IsOptional()
  @IsEnum(InclusaoPosicionamento)
  posicionamento?: InclusaoPosicionamento;

  @ValidateIf((o) => o.tipoAlteracao === ChangeType.inclusao)
  @IsOptional()
  @IsEnum(UnitType)
  tipoDispositivoIncluido?: UnitType;
}

export class ApplyConsolidationDto extends ConsolidationPreviewDto {
  @IsOptional()
  @IsString()
  fundamento?: string;
}

export class ExternalLegislativeSourceDto {
  @IsOptional()
  @IsEnum(ActType)
  tipo?: ActType;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsInt()
  ano?: number;

  @IsString()
  @MinLength(1)
  emissor!: string;

  @IsOptional()
  @IsDateString()
  data?: string;

  @IsString()
  @MinLength(1)
  descricao!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  arquivoUrl?: string;

  @IsOptional()
  @IsString()
  processo?: string;

  @IsOptional()
  @IsString()
  tribunal?: string;
}

export class RegisterExternalEffectDto {
  @ValidateNested()
  @Type(() => ExternalLegislativeSourceDto)
  source!: ExternalLegislativeSourceDto;

  @IsUUID()
  normaAlteradaActId!: string;

  @IsEnum(ChangeType)
  tipoAlteracao!: ChangeType;

  @ValidateIf((o) => o.tipoAlteracao !== ChangeType.inclusao)
  @IsUUID()
  unitId?: string;

  @ValidateIf(
    (o) =>
      o.tipoAlteracao === ChangeType.alteracao_redacao ||
      o.tipoAlteracao === ChangeType.inclusao,
  )
  @IsString()
  @MinLength(1)
  textoNovo?: string;

  @IsOptional()
  @IsString()
  identificacao?: string;

  @IsOptional()
  @IsDateString()
  data?: string;

  @IsOptional()
  @IsString()
  fundamento?: string;

  @ValidateIf((o) => o.tipoAlteracao === ChangeType.inclusao)
  @IsOptional()
  @IsUUID()
  referenciaUnitId?: string;

  @ValidateIf((o) => o.tipoAlteracao === ChangeType.inclusao)
  @IsOptional()
  @IsEnum(InclusaoPosicionamento)
  posicionamento?: InclusaoPosicionamento;

  @ValidateIf((o) => o.tipoAlteracao === ChangeType.inclusao)
  @IsOptional()
  @IsEnum(UnitType)
  tipoDispositivoIncluido?: UnitType;
}

export class CorrectConsolidationLinkDto {
  @IsUUID()
  sourceUnitId!: string;

  @IsOptional()
  @IsBoolean()
  regenerateNote?: boolean;
}

export class ListConsolidationLinksQuery {
  @IsOptional()
  @IsUUID()
  normaAlteradaActId?: string;

  @IsOptional()
  @IsUUID()
  normaAlteradoraActId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incompleteOnly?: boolean;
}
