import { ApiPropertyOptional } from '@nestjs/swagger';
import { PAGE_SIZE_MAX } from '@strategos/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** `?page=1&pageSize=50&q=texte` (13 — Listes, pagination, tri, recherche). */
export class PaginationQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: PAGE_SIZE_MAX, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_SIZE_MAX)
  pageSize: number = 50;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
