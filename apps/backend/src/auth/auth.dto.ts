import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH } from '@strategos/shared';
import { IsNewPassword, IsUsername } from '../common/validators.js';

export class LoginDto {
  @IsString()
  @MaxLength(USERNAME_MAX_LENGTH * 4)
  username: string;

  // Pas de longueur minimale : le mot de passe initial `admin` doit passer.
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}

/** Changement du mot de passe depuis le profil (`PUT /me/password`). */
export class ChangePasswordDto {
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword: string;

  @IsNewPassword()
  newPassword: string;
}

export class ChangeCredentialsDto extends ChangePasswordDto {
  /** Accepté seulement pour l'admin. */
  @IsOptional()
  @IsUsername()
  newUsername?: string;
}
