import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
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
  ALIGNMENTS,
  type Alignment,
  type BlockType,
  type BlockConfigs,
  type ButtonItem,
  type ButtonsBlockConfig,
  CATALOG_LAYOUTS,
  type CatalogBlockConfig,
  type CatalogDetail,
  type CatalogLayout,
  CELL_FORMATS,
  type CellFormat,
  CHAT_HEIGHT_MAX,
  CHAT_HEIGHT_MIN,
  CHAT_NAME_MAX_LENGTH,
  type ChatBlockConfig,
  type DataRange,
  DISCUSSION_SPACE_NAME_MAX_LENGTH,
  type DiscussionSpaceBlockConfig,
  type FormBlockConfig,
  type ImageBlockConfig,
  type RichContentBlockConfig,
  TABLE_PAGE_SIZES,
  type TableBlockConfig,
  type TableColumn,
} from '../pages/blocks.js';
import {
  COLUMN_PATTERN,
  COLUMNS_REF_PATTERN,
  MAX_ROW,
  RANGE_REF_PATTERN,
} from '../sources/refs.js';
import { type TopicSort, TOPIC_SORTS } from '../enums.js';
import { LinkTargetSchema } from './links.schema.js';

// Schémas de `config` par type de module, validés par le backend (class-validator).

export class ImageBlockConfigSchema implements ImageBlockConfig {
  @IsUUID()
  mediaId: string;

  @IsString()
  @MaxLength(300)
  alt: string;

  @IsIn(['fit', 'original'])
  size: 'fit' | 'original';

  @IsIn(ALIGNMENTS)
  align: Alignment;

  @IsOptional()
  @ValidateNested()
  @Type(() => LinkTargetSchema)
  link?: LinkTargetSchema;
}

export class ButtonItemSchema implements ButtonItem {
  @IsUUID()
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;

  @ValidateNested()
  @Type(() => LinkTargetSchema)
  target: LinkTargetSchema;
}

export class ButtonsBlockConfigSchema implements ButtonsBlockConfig {
  @ValidateNested({ each: true })
  @Type(() => ButtonItemSchema)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  buttons: ButtonItemSchema[];

  @IsIn(['horizontal', 'vertical'])
  orientation: 'horizontal' | 'vertical';

  @IsIn(ALIGNMENTS)
  align: Alignment;
}

export class RichContentBlockConfigSchema implements RichContentBlockConfig {
  @IsString()
  @MaxLength(100_000)
  html: string;
}

export class DataRangeSchema implements DataRange {
  @IsIn(['fixed', 'extensible'])
  mode: 'fixed' | 'extensible';

  @ValidateIf((o: DataRange) => o.mode === 'fixed')
  @Matches(RANGE_REF_PATTERN)
  ref?: string;

  @ValidateIf((o: DataRange) => o.mode === 'extensible')
  @Matches(COLUMNS_REF_PATTERN)
  columns?: string;

  @ValidateIf((o: DataRange) => o.mode === 'extensible')
  @IsInt()
  @Min(1)
  @Max(MAX_ROW)
  startRow?: number;
}

export class TableColumnSchema implements TableColumn {
  @Matches(COLUMN_PATTERN)
  col: string;

  @IsBoolean()
  visible: boolean;

  @IsString()
  @MaxLength(100)
  label: string;

  @IsIn(CELL_FORMATS)
  format: CellFormat;
}

/**
 * Tableau. Les règles croisées (colonnes dans la plage, source existante) sont
 * vérifiées par le backend après ce schéma.
 */
export class TableBlockConfigSchema implements TableBlockConfig {
  // Source, feuille et plage vides : module non configuré, masqué (10).
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sourceId: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sheet: string | null;

  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => DataRangeSchema)
  range: DataRangeSchema | null;

  @IsBoolean()
  headerRow: boolean;

  @ValidateNested({ each: true })
  @Type(() => TableColumnSchema)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  columns: TableColumnSchema[];

  @IsIn(TABLE_PAGE_SIZES)
  pageSize: number;

  @IsBoolean()
  sortable: boolean;

  @IsBoolean()
  searchable: boolean;
}

export class CatalogDetailSchema implements CatalogDetail {
  @Matches(COLUMN_PATTERN)
  col: string;

  @IsString()
  @MaxLength(100)
  label: string;

  @IsIn(CELL_FORMATS)
  format: CellFormat;
}

export class CatalogBlockConfigSchema implements CatalogBlockConfig {
  // Source, feuille et plage vides : module non configuré, masqué (10).
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sourceId: string | null;

  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  sheet: string | null;

  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => DataRangeSchema)
  range: DataRangeSchema | null;

  @IsBoolean()
  headerRow: boolean;

  @IsIn(CATALOG_LAYOUTS)
  layout: CatalogLayout;

  @IsOptional()
  @Matches(COLUMN_PATTERN)
  imageCol?: string;

  @IsOptional()
  @Matches(COLUMN_PATTERN)
  titleCol?: string;

  @IsOptional()
  @Matches(COLUMN_PATTERN)
  subtitleCol?: string;

  @ValidateNested({ each: true })
  @Type(() => CatalogDetailSchema)
  @ArrayMaxSize(20)
  details: CatalogDetailSchema[];

  @IsInt()
  @Min(1)
  @Max(4)
  perRow: number;

  @IsIn(TABLE_PAGE_SIZES)
  pageSize: number;

  @IsBoolean()
  searchable: boolean;
}

export class FormBlockConfigSchema implements FormBlockConfig {
  @IsUUID()
  formId: string;
}

export class DiscussionSpaceBlockConfigSchema implements DiscussionSpaceBlockConfig {
  @IsString()
  @MinLength(1)
  @MaxLength(DISCUSSION_SPACE_NAME_MAX_LENGTH)
  name: string;

  @IsIn(TOPIC_SORTS)
  sortMode: TopicSort;
}

export class ChatBlockConfigSchema implements ChatBlockConfig {
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_NAME_MAX_LENGTH)
  name: string;

  @IsInt()
  @Min(CHAT_HEIGHT_MIN)
  @Max(CHAT_HEIGHT_MAX)
  height: number;
}

/** Un schéma par module disponible ; le typage impose d'en avoir un pour chacun. */
export const BLOCK_CONFIG_SCHEMAS: { [K in BlockType]: new () => BlockConfigs[K] } = {
  image: ImageBlockConfigSchema,
  buttons: ButtonsBlockConfigSchema,
  rich_content: RichContentBlockConfigSchema,
  table: TableBlockConfigSchema,
  catalog: CatalogBlockConfigSchema,
  form: FormBlockConfigSchema,
  discussion_space: DiscussionSpaceBlockConfigSchema,
  chat: ChatBlockConfigSchema,
};
