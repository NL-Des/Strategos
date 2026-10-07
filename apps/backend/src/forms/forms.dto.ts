import {
  BULK_VALIDATE_MAX,
  FormMode,
  REIMPORT_MODES,
  type ReimportMode,
  SubmissionStatus,
  type SubmissionValues,
} from '@strategos/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto.js';

export class CreateFormDto {
  @IsUUID()
  pageId: string;

  @IsUUID()
  pageBlockId: string;

  @IsIn(Object.values(FormMode))
  mode: FormMode;
}

/** Brouillon de la définition ; `definition` est validée par `FormDefinitionSchema`. */
export class SaveFormDraftDto {
  @IsDefined()
  definition: unknown;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

/** Réglages immédiats (09 — Ouverture et fermeture, Validation automatique). */
export class FormSettingsDto {
  @IsOptional()
  @ValidateIf((o: FormSettingsDto) => o.closesAt !== null)
  @IsISO8601()
  closesAt?: string | null;

  @IsOptional()
  @IsBoolean()
  autoValidate?: boolean;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class SubmitFormDto {
  @IsObject()
  values: SubmissionValues;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rowKey?: string;
}

export class PrefillQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  rowKey: string;
}

export class ValidateSubmissionDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

/** Validation groupée des soumissions cochées dans la file. */
export class BulkValidateSubmissionsDto extends ValidateSubmissionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_VALIDATE_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class ModifySubmissionDto extends ValidateSubmissionDto {
  @IsObject()
  values: SubmissionValues;
}

export class RejectSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** File des soumissions : filtres par statut, formulaire, page, utilisateur et période. */
export class SubmissionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(SubmissionStatus))
  status?: SubmissionStatus;

  @IsOptional()
  @IsUUID()
  formId?: string;

  @IsOptional()
  @IsUUID()
  pageId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['createdAt:asc', 'createdAt:desc'])
  sort?: 'createdAt:asc' | 'createdAt:desc';
}

export class ReimportConfirmDto {
  @IsUUID()
  reimportToken: string;

  @IsIn(REIMPORT_MODES)
  mode: ReimportMode;
}
