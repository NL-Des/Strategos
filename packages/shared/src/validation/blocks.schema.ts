import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ALIGNMENTS,
  type Alignment,
  type AvailableBlockType,
  type BlockConfigs,
  type ButtonItem,
  type ButtonsBlockConfig,
  type ImageBlockConfig,
  type RichContentBlockConfig,
} from '../pages/blocks.js';
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

/** Un schéma par module disponible ; le typage impose d'en avoir un pour chacun. */
export const BLOCK_CONFIG_SCHEMAS: { [K in AvailableBlockType]: new () => BlockConfigs[K] } = {
  image: ImageBlockConfigSchema,
  buttons: ButtonsBlockConfigSchema,
  rich_content: RichContentBlockConfigSchema,
};
