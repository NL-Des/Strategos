import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import type { UserStatus } from '@strategos/shared';
import { PaginationQueryDto } from '../common/pagination.dto.js';
import { IsNewPassword, IsUsername } from '../common/validators.js';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: UserStatus;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class CreateUserDto {
  @IsUsername()
  username: string;

  @IsNewPassword()
  temporaryPassword: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class UpdateUserDto {
  @IsUsername()
  username: string;

  /** Page personnelle (03) ; `null` la retire, absent la laisse inchangée. */
  @IsOptional()
  @IsUUID()
  personalPageId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

export class ResetPasswordDto {
  @IsNewPassword()
  temporaryPassword: string;
}
