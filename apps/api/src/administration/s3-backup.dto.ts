import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateS3BackupConfigDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MaxLength(255)
  bucket!: string;

  @IsString()
  @MaxLength(64)
  region!: string;

  @IsString()
  @MaxLength(255)
  accessKeyId!: string;

  /** Vazio / omitido = manter o segredo já salvo. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  secretAccessKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  endpoint?: string | null;

  @IsOptional()
  @IsBoolean()
  forcePathStyle?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  prefix!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  keepDaily!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  keepWeekly!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  keepMonthly!: number;
}
