import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class UpdateSettingsDto {
  /** `null` : pas de page d'arrivée. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  landingPageId: string | null;

  @IsUUID()
  defaultThemeId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  backupRetentionDays: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}
