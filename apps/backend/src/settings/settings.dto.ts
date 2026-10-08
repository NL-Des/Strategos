import { Type } from 'class-transformer';
import { ExternalImages } from '@strategos/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Nom de domaine seul : ni protocole, ni chemin, ni port. */
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export class UpdateSettingsDto {
  /** `null` : pas de page d'arrivée. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  landingPageId: string | null;

  @IsUUID()
  defaultThemeId: string;

  /** `null` : pas de thème du mode sombre, les pages gardent le leur. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  darkThemeId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  backupRetentionDays: number;

  /** Absent : réglage inchangé. */
  @IsOptional()
  @IsIn(Object.values(ExternalImages))
  externalImages?: ExternalImages;

  /** Domaines dont les images sont affichées en mode `allowlist` ; absent : inchangé. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(DOMAIN, { each: true })
  externalImageDomains?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}
