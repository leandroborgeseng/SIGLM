import { ChangeType } from '@prisma/client';
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
}

export class ApplyConsolidationDto extends ConsolidationPreviewDto {
  @IsOptional()
  @IsString()
  fundamento?: string;
}
