import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  AUTO_FIELDS,
  type AutoField,
  DATE_PATTERN,
  FIELD_KEY_PATTERN,
  FIELD_MAX_LENGTH,
  FIELD_TYPES,
  type FieldOptions,
  type FieldType,
  FORM_MAX_FIELDS,
  FORM_MAX_NEW_ROWS,
  type FormDefinition,
  type FormField,
  SELECT_MAX_OPTIONS,
} from '../forms/definition.js';
import { CELL_REF_PATTERN, COLUMN_PATTERN, MAX_ROW, RANGE_REF_PATTERN } from '../sources/refs.js';

// Définition d'un formulaire (09). Le schéma ne vérifie que la forme : les
// règles croisées (source existante, clés uniques, champ mappé selon le mode,
// périmètre) sont vérifiées par le backend, et un brouillon incomplet est
// accepté (formulaire « non configuré »).

/** Options d'une liste : `values` saisies, ou `sourceId` + `sheet` + `range` lus dans le document. */
export class FieldOptionsSchema implements FieldOptions {
  @IsIn(['list', 'range'])
  kind: 'list' | 'range';

  @ValidateIf((o: FieldOptionsSchema) => o.kind === 'list')
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @ArrayMaxSize(SELECT_MAX_OPTIONS)
  values?: string[];

  @ValidateIf((o: FieldOptionsSchema) => o.kind === 'range')
  @IsUUID()
  sourceId?: string;

  @ValidateIf((o: FieldOptionsSchema) => o.kind === 'range')
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sheet?: string;

  @ValidateIf((o: FieldOptionsSchema) => o.kind === 'range')
  @Matches(RANGE_REF_PATTERN)
  range?: string;
}

export class FormFieldSchema implements FormField {
  @Matches(FIELD_KEY_PATTERN)
  key: string;

  @IsString()
  @MaxLength(200)
  label: string;

  @IsString()
  @MaxLength(1000)
  help: string;

  @IsIn(FIELD_TYPES)
  type: FieldType;

  @IsBoolean()
  required: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(FIELD_MAX_LENGTH)
  maxLength?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  min?: number;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  max?: number;

  @IsOptional()
  @Matches(DATE_PATTERN)
  minDate?: string;

  @IsOptional()
  @Matches(DATE_PATTERN)
  maxDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FieldOptionsSchema)
  options?: FieldOptionsSchema;

  @IsOptional()
  @IsIn(AUTO_FIELDS)
  auto?: AutoField;

  @IsOptional()
  @IsBoolean()
  movement?: boolean;

  @IsOptional()
  @Matches(CELL_REF_PATTERN)
  cell?: string;

  @IsOptional()
  @Matches(COLUMN_PATTERN)
  col?: string;
}

export class FormDefinitionSchema implements FormDefinition {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(5000)
  intro: string;

  @IsString()
  @MaxLength(2000)
  successMessage: string;

  @IsOptional()
  @IsUUID()
  sourceId: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sheet: string | null;

  @ValidateNested({ each: true })
  @Type(() => FormFieldSchema)
  @ArrayMaxSize(FORM_MAX_FIELDS)
  fields: FormFieldSchema[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ROW)
  rowStart?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ROW)
  rowEnd?: number | null;

  @IsOptional()
  @Matches(COLUMN_PATTERN)
  keyCol?: string;

  @IsOptional()
  @IsUUID()
  linkedBlockId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ROW)
  startRow?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(FORM_MAX_NEW_ROWS)
  maxNewRows?: number;
}
