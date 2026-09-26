import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto.js';

export class ListMediaQueryDto extends PaginationQueryDto {}

export class UploadMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;
}
