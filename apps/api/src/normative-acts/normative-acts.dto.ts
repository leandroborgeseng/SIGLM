import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActSituacao, ActType, EffectType, InclusaoPosicionamento, UnitType } from '@prisma/client';

export class UnitFormatacaoDto {
  @IsOptional()
  @IsIn(['left', 'center', 'right', 'justify'])
  align?: 'left' | 'center' | 'right' | 'justify';

  @IsOptional()
  @IsBoolean()
  bold?: boolean;

  @IsOptional()
  @IsBoolean()
  italic?: boolean;

  @IsOptional()
  @IsBoolean()
  underline?: boolean;

  @IsOptional()
  @IsIn(['normal', 'expanded'])
  letterSpacing?: 'normal' | 'expanded';
}

export class CreateActDto {
  @IsEnum(ActType)
  tipo!: ActType;

  @IsInt()
  @Min(1)
  numero!: number;

  @IsInt()
  @Min(1900)
  ano!: number;

  @IsOptional()
  @IsString()
  @MinLength(0)
  ementa?: string;

  @IsOptional()
  @IsString()
  assunto?: string;

  @IsOptional()
  @IsDateString()
  dataAto?: string;

  @IsOptional()
  @IsDateString()
  dataPublicacao?: string;

  @IsOptional()
  @IsString()
  orgaoOrigem?: string;

  @IsOptional()
  @IsString()
  orgaoOrigemId?: string;

  @IsOptional()
  @IsString()
  autoridadeSignataria?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  palavrasChave?: string[];
}

export class UpdateActDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  ementa?: string;

  @IsOptional()
  @IsString()
  assunto?: string;

  @IsOptional()
  @IsEnum(ActSituacao)
  situacao?: ActSituacao;

  @IsOptional()
  @IsDateString()
  dataAto?: string;

  @IsOptional()
  @IsDateString()
  dataPublicacao?: string;

  @IsOptional()
  @IsString()
  orgaoOrigem?: string;

  @IsOptional()
  @IsString()
  orgaoOrigemId?: string;

  @IsOptional()
  @IsString()
  autoridadeSignataria?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  palavrasChave?: string[];

  @IsOptional()
  @IsString()
  observacoesInternas?: string;
}

export class UnitInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsEnum(UnitType)
  tipoUnidade!: UnitType;

  @IsOptional()
  @IsString()
  identificacao?: string;

  @IsString()
  texto!: string;

  @IsInt()
  @Min(0)
  ordem!: number;

  @IsOptional()
  @IsString()
  parentUnitId?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UnitFormatacaoDto)
  formatacao?: UnitFormatacaoDto | null;
}

export class LegislativeEffectInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  sourceUnitId!: string;

  @IsString()
  normaAlteradaActId!: string;

  @IsOptional()
  @IsString()
  targetUnitId?: string | null;

  @IsEnum(EffectType)
  tipoEfeito!: EffectType;

  @IsDateString()
  dataVigencia!: string;

  @IsOptional()
  @IsString()
  observacoes?: string | null;

  @IsOptional()
  @IsEnum(UnitType)
  tipoDispositivoIncluido?: UnitType | null;

  @IsOptional()
  @IsEnum(InclusaoPosicionamento)
  posicionamento?: InclusaoPosicionamento | null;

  @IsOptional()
  @IsString()
  referenciaUnitId?: string | null;

  @IsOptional()
  @IsString()
  textoNovo?: string | null;

  @IsOptional()
  @IsString()
  redacaoUnitId?: string | null;

  @IsOptional()
  @IsString()
  novaIdentificacao?: string | null;

  @IsOptional()
  @IsInt()
  ordem?: number;
}

export class SaveLegislativeEffectsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegislativeEffectInputDto)
  effects!: LegislativeEffectInputDto[];
}

export class SaveUnitsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnitInputDto)
  units!: UnitInputDto[];
}

export class AddUnitDto {
  @IsEnum(UnitType)
  tipoUnidade!: UnitType;

  @IsOptional()
  @IsString()
  identificacao?: string;

  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @IsString()
  parentUnitId?: string | null;

  /** Inserir imediatamente após este elemento (e sua subárvore). */
  @IsOptional()
  @IsString()
  afterUnitId?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UnitFormatacaoDto)
  formatacao?: UnitFormatacaoDto | null;
}
