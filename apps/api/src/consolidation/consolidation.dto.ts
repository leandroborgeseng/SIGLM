import { ChangeType, InclusaoPosicionamento, UnitType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ConsolidationPreviewDto {
  @IsUUID()
  normaAlteradoraActId!: string;

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
