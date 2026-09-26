import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import type { UserStatus } from '@strategos/shared';
import { PaginationQueryDto } from '../common/pagination.dto.js';
import { IsNewPassword, IsUsername } from '../common/validators.js';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: UserStatus;
}

export class CreateUserDto {
  @IsUsername()
  username: string;

  @IsNewPassword()
  temporaryPassword: string;
}

export class UpdateUserDto {
  @IsUsername()
  username: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

export class ResetPasswordDto {
  @IsNewPassword()
  temporaryPassword: string;
}
