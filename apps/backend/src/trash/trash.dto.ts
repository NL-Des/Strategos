import { TRASH_TYPES, type TrashType } from '@strategos/shared';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto.js';

/** Corbeille paginée, filtre par type (13 — Supervision). */
export class TrashQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(TRASH_TYPES)
  type?: TrashType;
}
