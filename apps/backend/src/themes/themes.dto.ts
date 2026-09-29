import { THEME_NAME_MAX_LENGTH } from '@strategos/shared';
import { ThemeConfigSchema } from '@strategos/shared/validation';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Length, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateThemeDto {
  @Transform(trim)
  @IsString()
  @Length(1, THEME_NAME_MAX_LENGTH)
  name: string;

  @ValidateNested()
  @Type(() => ThemeConfigSchema)
  config: ThemeConfigSchema;
}

/** Modification d'un thème, avec la `version` lue (`409 EDIT_CONFLICT` sinon). */
export class UpdateThemeDto extends CreateThemeDto {
  @IsInt()
  @Min(1)
  version: number;
}
