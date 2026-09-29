import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PAGE_SIZE_MAX } from '@strategos/shared';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePageDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}

/** Enregistrement du brouillon ; `config` est validé par `validatePageConfig`. */
export class SavePageDraftDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @IsDefined()
  config: unknown;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

export class SaveLayoutDraftDto {
  @IsDefined()
  config: unknown;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

/** Aperçu, éventuellement avec les droits d'un groupe (`?asGroup=<groupId>`). */
export class PreviewQueryDto {
  @IsOptional()
  @IsUUID()
  asGroup?: string;
}

/**
 * Lignes d'un Tableau ou d'un Catalogue (`?page&pageSize&sort&q`). Sans
 * `pageSize`, celui du module ; `sort` = `<indice de colonne affichée>:asc|desc`.
 */
export class BlockRowsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_SIZE_MAX)
  pageSize?: number;

  @IsOptional()
  @Matches(/^\d{1,2}:(asc|desc)$/)
  sort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** Route admin : lignes du brouillon, pour l'aperçu. */
  @IsOptional()
  @IsIn(['true'])
  preview?: string;
}
