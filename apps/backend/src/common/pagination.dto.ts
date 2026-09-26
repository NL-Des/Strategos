import { PAGE_SIZE_MAX } from '@strategos/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** `?page=1&pageSize=50&q=texte` (13 — Listes, pagination, tri, recherche). */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_SIZE_MAX)
  pageSize = 50;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
