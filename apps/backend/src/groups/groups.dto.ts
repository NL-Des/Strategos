import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  RESOURCE_TYPES,
  type ResourceType,
} from '@strategos/shared';
import { GroupPermissionInputSchema } from '@strategos/shared/validation';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateGroupDto {
  @Transform(trim)
  @IsString()
  @Length(1, GROUP_NAME_MAX_LENGTH)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(GROUP_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

export class UpdateGroupDto extends CreateGroupDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;
}

/** Au plus quelques centaines de comptes (03 — échelle). */
const MAX_IDS = 5000;

export class ReplaceMembersDto {
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsUUID('all', { each: true })
  userIds: string[];
}

export class ReplaceUserGroupsDto {
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @IsUUID('all', { each: true })
  groupIds: string[];
}

export class ReplacePermissionsDto {
  @IsArray()
  @ArrayMaxSize(MAX_IDS)
  @ValidateNested({ each: true })
  @Type(() => GroupPermissionInputSchema)
  permissions: GroupPermissionInputSchema[];
}

export class RightsMatrixQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  group?: string;

  @IsOptional()
  @IsIn(RESOURCE_TYPES)
  type?: ResourceType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  user?: string;
}
