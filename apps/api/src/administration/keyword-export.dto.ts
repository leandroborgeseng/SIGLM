import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class KeywordExportQueryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  keyword!: string;
}

export class KeywordExportZipDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  keyword!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  actIds?: string[];
}
