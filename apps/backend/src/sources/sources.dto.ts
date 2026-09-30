import { ApiPropertyOptional } from '@nestjs/swagger';
import { GRID_MAX_COLS, GRID_MAX_ROWS, MAX_COLUMN, MAX_ROW } from '@strategos/shared';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** `POST /admin/sources` : un Google Sheet par son lien, ou un fichier du OneDrive connecté. */
export class AddSourceDto {
  @IsIn(['gsheet', 'onedrive'])
  type: 'gsheet' | 'onedrive';

  @ValidateIf((o: AddSourceDto) => o.type === 'gsheet')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  url?: string;

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
