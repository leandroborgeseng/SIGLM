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
import {
  ActSituacao,
  ActType,
  EditorialStage,
  EffectType,
  InclusaoPosicionamento,
  UnitType,
} from '@prisma/client';

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

export class ActSignatoryInputDto {
  @IsOptional()
  @IsString()
  signatoryId?: string | null;

  @IsString()
  @MinLength(1)
  nome!: string;

  @IsString()
  @MinLength(1)
  cargo!: string;

  @IsInt()
  @Min(0)
  ordem!: number;
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
  @IsArray()
  @IsString({ each: true })
  orgaoOrigemIds?: string[];

  @IsOptional()
  @IsString()
  meioPublicacaoId?: string | null;

  @IsOptional()
  @IsBoolean()
  atoConjunto?: boolean;

  @IsOptional()
  @IsIn(['none', 'auto', 'manual'])
  prefixoTituloModo?: 'none' | 'auto' | 'manual';

  @IsOptional()
  @IsString()
  prefixoTitulo?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActSignatoryInputDto)
  signatories?: ActSignatoryInputDto[];

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
  @IsArray()
  @IsString({ each: true })
  orgaoOrigemIds?: string[];

  @IsOptional()
  @IsString()
  meioPublicacaoId?: string | null;

  @IsOptional()
  @IsBoolean()
  atoConjunto?: boolean;

  @IsOptional()
  @IsIn(['none', 'auto', 'manual'])
  prefixoTituloModo?: 'none' | 'auto' | 'manual';

  @IsOptional()
  @IsString()
  prefixoTitulo?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActSignatoryInputDto)
  signatories?: ActSignatoryInputDto[];

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

  @IsOptional()
  @IsEnum(EditorialStage)
  etapaEditorial?: EditorialStage;

  @IsOptional()
  @IsString()
  responsavelEstruturacaoId?: string | null;

  @IsOptional()
  @IsString()
  responsavelRevisaoId?: string | null;
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

export class DeleteUnitDto {
  /** cascade = remove subordinados; reparent = reposiciona filhos no pai do excluído (ou null). */
  @IsIn(['cascade', 'reparent'])
  mode!: 'cascade' | 'reparent';

  @IsOptional()
  @IsString()
  newParentId?: string | null;

  /** Confirma remoção/nulificação de vínculos em efeitos legislativos. */
  @IsOptional()
  @IsBoolean()
  confirmEffectCleanup?: boolean;
}

export class ReturnToStructuringDto {
  @IsString()
  @MinLength(3)
  justificativa!: string;
}

export class StructureFromOriginalDto {
  /** Obrigatório quando o ato já possui unidades — confirma substituição total. */
  @IsOptional()
  @IsBoolean()
  confirmReplace?: boolean;
}

export class UpdateIdentifiedImportTextDto {
  @IsString()
  textoIdentificadoImportacao!: string;
}

export class BatchSignatoryDto {
  @IsOptional()
  @IsString()
  signatoryId?: string | null;

  @IsString()
  @MinLength(1)
  nome!: string;

  @IsString()
  @MinLength(1)
  cargo!: string;

  @IsIn(['append', 'replace'])
  mode!: 'append' | 'replace';
}

export class BatchUpdateActsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actIds?: string[];

  /** Seleciona todos os atos que casam com os filtros informados (ignora paginação). */
  @IsOptional()
  @IsBoolean()
  selectAllFiltered?: boolean;

  @IsIn([
    'set_responsavel_estruturacao',
    'set_responsavel_revisao',
    'set_meio_publicacao',
    'set_signatario',
  ])
  action!:
    | 'set_responsavel_estruturacao'
    | 'set_responsavel_revisao'
    | 'set_meio_publicacao'
    | 'set_signatario';

  @IsOptional()
  @IsString()
  responsavelEstruturacaoId?: string | null;

  @IsOptional()
  @IsString()
  responsavelRevisaoId?: string | null;

  @IsOptional()
  @IsString()
  meioPublicacaoId?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => BatchSignatoryDto)
  signatory?: BatchSignatoryDto;

  @IsOptional()
  @IsEnum(ActType)
  tipo?: ActType;

  @IsOptional()
  @IsEnum(ActSituacao)
  situacao?: ActSituacao;

  @IsOptional()
  @IsString()
  statusPublicacao?: string;

  @IsOptional()
  @IsEnum(EditorialStage)
  etapaEditorial?: EditorialStage;

  @IsOptional()
  @IsString()
  norma?: string;

  @IsOptional()
  @IsString()
  ementa?: string;

  @IsOptional()
  @IsString()
  publicadoDe?: string;

  @IsOptional()
  @IsString()
  publicadoAte?: string;

  @IsOptional()
  @IsString()
  orgaoOrigemId?: string;

  @IsOptional()
  @IsString()
  numeroDe?: string;

  @IsOptional()
  @IsString()
  numeroAte?: string;

  @IsOptional()
  @IsString()
  meioPublicacaoIdFilter?: string;

  @IsOptional()
  @IsString()
  signatarioNome?: string;

  @IsOptional()
  @IsString()
  responsavelEstruturacaoIdFilter?: string;

  @IsOptional()
  @IsString()
  responsavelRevisaoIdFilter?: string;
}
