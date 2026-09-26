import { applyDecorators } from '@nestjs/common';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@strategos/shared';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

/** Pseudo : 2 à 32 caractères après suppression des espaces autour, sans caractère de contrôle. */
export const IsUsername = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString(),
    Length(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH),
    Matches(/^[^\p{Cc}]*$/u),
  );

/** Nouveau mot de passe : 12 à 128 caractères, sans autre règle. */
export const IsNewPassword = () =>
  applyDecorators(IsString(), Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH));
