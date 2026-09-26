import { Transform, Type } from 'class-transformer';
import { IsDefined, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePageDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}

/** Enregistrement du brouillon ; `config` est validé par `validatePageConfig`. */
export class SavePageDraftDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @IsDefined()
  config: unknown;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

export class SaveLayoutDraftDto {
  @IsDefined()
  config: unknown;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

/** Aperçu, éventuellement avec les droits d'un groupe (`?asGroup=<groupId>`). */
export class PreviewQueryDto {
  @IsOptional()
  @IsUUID()
  asGroup?: string;
}
