import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** `POST /admin/sources` : un Google Sheet par son lien, ou un fichier du OneDrive connecté. */
export class AddSourceDto {
  @IsIn(['gsheet', 'onedrive'])
  type: 'gsheet' | 'onedrive';

  @ValidateIf((o: AddSourceDto) => o.type === 'gsheet')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  url?: string;

  @ValidateIf((o: AddSourceDto) => o.type === 'onedrive')
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  itemId?: string;
}

export class BrowseQueryDto {
  @ApiPropertyOptional({ type: String, maxLength: 1000, default: '' })
  @IsString()
  @MaxLength(1000)
  path: string = '';
}
