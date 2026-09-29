import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  THEME_BUTTON_STYLES,
  THEME_FONTS,
  THEME_RADIUS_MAX,
  THEME_TEXT_SIZE_MAX,
  THEME_TEXT_SIZE_MIN,
  type ThemeBackground,
  type ThemeButtons,
  type ThemeButtonStyle,
  type ThemeCards,
  type ThemeDiscussions,
  type ThemeConfig,
  type ThemeFont,
  type ThemeSurface,
  type ThemeTables,
  type ThemeText,
} from '../pages/themes.js';

// Schémas d'un thème (06 — Thèmes), validés par le backend.

const COLOR = /^#[0-9a-fA-F]{6}$/;

export class ThemeBackgroundSchema implements ThemeBackground {
  @Matches(COLOR)
  color: string;

  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  imageMediaId: string | null;
}

export class ThemeTextSchema implements ThemeText {
  @Matches(COLOR)
  color: string;

  @Matches(COLOR)
  headingColor: string;

  @Matches(COLOR)
  linkColor: string;

  @IsIn(THEME_FONTS)
  font: ThemeFont;

  @IsIn(THEME_FONTS)
  headingFont: ThemeFont;

  @IsInt()
  @Min(THEME_TEXT_SIZE_MIN)
  @Max(THEME_TEXT_SIZE_MAX)
  size: number;
}

export class ThemeSurfaceSchema implements ThemeSurface {
  @Matches(COLOR)
  color: string;

  @Matches(COLOR)
  borderColor: string;

  @IsInt()
  @Min(0)
  @Max(THEME_RADIUS_MAX)
  radius: number;
}

export class ThemeButtonsSchema implements ThemeButtons {
  @Matches(COLOR)
  background: string;

  @Matches(COLOR)
  color: string;

  @IsInt()
  @Min(0)
  @Max(THEME_RADIUS_MAX)
  radius: number;

  @IsIn(THEME_BUTTON_STYLES)
  style: ThemeButtonStyle;
}

export class ThemeTablesSchema implements ThemeTables {
  @Matches(COLOR)
  headerBackground: string;

  @Matches(COLOR)
  headerColor: string;

  @Matches(COLOR)
  borderColor: string;

  @Matches(COLOR)
  stripeColor: string;
}

export class ThemeCardsSchema implements ThemeCards {
  @Matches(COLOR)
  background: string;

  @Matches(COLOR)
  borderColor: string;

  @Matches(COLOR)
  titleColor: string;

  @IsInt()
  @Min(0)
  @Max(THEME_RADIUS_MAX)
  radius: number;

  @IsBoolean()
  shadow: boolean;
}

export class ThemeDiscussionsSchema implements ThemeDiscussions {
  @Matches(COLOR)
  background: string;

  @Matches(COLOR)
  borderColor: string;

  @Matches(COLOR)
  messageBackground: string;

  @Matches(COLOR)
  authorColor: string;

  @IsInt()
  @Min(0)
  @Max(THEME_RADIUS_MAX)
  radius: number;
}

export class ThemeConfigSchema implements ThemeConfig {
  @ValidateNested()
  @Type(() => ThemeBackgroundSchema)
  background: ThemeBackgroundSchema;

  @ValidateNested()
  @Type(() => ThemeTextSchema)
  text: ThemeTextSchema;

  @ValidateNested()
  @Type(() => ThemeSurfaceSchema)
  surface: ThemeSurfaceSchema;

  @ValidateNested()
  @Type(() => ThemeButtonsSchema)
  buttons: ThemeButtonsSchema;

  @ValidateNested()
  @Type(() => ThemeTablesSchema)
  tables: ThemeTablesSchema;

  @ValidateNested()
  @Type(() => ThemeCardsSchema)
  cards: ThemeCardsSchema;

  @ValidateNested()
  @Type(() => ThemeDiscussionsSchema)
  discussions: ThemeDiscussionsSchema;
}
