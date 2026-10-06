import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CELL_TEXT_MAX_LENGTH,
  type CellEditInput,
  FORMULA_MAX_LENGTH,
  GRID_MAX_COLS,
  GOOGLE_CLIENT_ID_PATTERN,
  GOOGLE_SECRET_MAX_LENGTH,
  SOURCE_URL_MAX_LENGTH,
  SPREADSHEET_ID_PATTERN,
  type GoogleConfigInput,
  GRID_MAX_ROWS,
  MAX_COLUMN,
  MAX_ROW,
} from '@strategos/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Valeur collée depuis la console Google : sans les espaces autour. */
const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** `PUT /admin/google/config` : identifiants du projet Google Cloud. */
export class GoogleConfigDto implements GoogleConfigInput {
  @Trim()
  @IsString()
  @MaxLength(GOOGLE_SECRET_MAX_LENGTH)
  @Matches(GOOGLE_CLIENT_ID_PATTERN)
  clientId: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(GOOGLE_SECRET_MAX_LENGTH)
  clientSecret: string;

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(GOOGLE_SECRET_MAX_LENGTH)
  apiKey?: string;
}

/**
 * `POST /admin/sources` : un Google Sheet choisi dans le sélecteur, un fichier du
 * OneDrive connecté, ou un Google Sheet partagé par lien public.
 */
export class AddSourceDto {
  @IsIn(['gsheet', 'onedrive', 'gsheet_link'])
  type: 'gsheet' | 'onedrive' | 'gsheet_link';

  @ValidateIf((o: AddSourceDto) => o.type === 'gsheet')
  @IsString()
  @Matches(SPREADSHEET_ID_PATTERN)
  spreadsheetId?: string;

  @ValidateIf((o: AddSourceDto) => o.type === 'gsheet_link')
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(SOURCE_URL_MAX_LENGTH)
  url?: string;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;

  @ValidateIf((o: AddSourceDto) => o.type === 'onedrive')
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  itemId?: string;
}

export class BrowseQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 1000, default: '' })
  @IsString()
  @MaxLength(1000)
  path: string = '';
}

/** `GET /admin/sources/:id/cells` : fenêtre de la grille (04 — Sources). */
export class GridQueryDto {
  @ApiPropertyOptional({ type: String, description: 'Feuille ; la première par défaut' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sheet?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ROW)
  top: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COLUMN)
  left: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: GRID_MAX_ROWS, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(GRID_MAX_ROWS)
  rows: number = 50;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: GRID_MAX_COLS, default: 26 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(GRID_MAX_COLS)
  cols: number = 26;
}

class ExpectedCellDto {
  @IsString()
  @MaxLength(CELL_TEXT_MAX_LENGTH)
  display: string;

  @IsOptional()
  @IsString()
  @MaxLength(FORMULA_MAX_LENGTH)
  formula: string | null;
}

/** `PATCH /admin/sources/:id/cells` : modification d'une cellule dans la grille. */
export class CellEditDto implements CellEditInput {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  sheet: string;

  @IsInt()
  @Min(1)
  @Max(MAX_ROW)
  row: number;

  @IsInt()
  @Min(1)
  @Max(MAX_COLUMN)
  col: number;

  @ValidateNested()
  @Type(() => ExpectedCellDto)
  expected: ExpectedCellDto;

  @IsString()
  @MaxLength(CELL_TEXT_MAX_LENGTH)
  input: string;
}
