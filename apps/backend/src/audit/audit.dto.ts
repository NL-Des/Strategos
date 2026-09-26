import { ActorKind, AUDIT_TARGET_TYPES } from '@strategos/shared';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto.js';

/** Filtres du journal : acteur, action, type de cible, période (13 — Supervision). */
export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(ActorKind))
  actorKind?: ActorKind;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsIn(AUDIT_TARGET_TYPES)
  targetType?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  /** Début de période, inclus (ISO 8601). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fin de période, exclue (ISO 8601). */
  @IsOptional()
  @IsDateString()
  to?: string;
}
