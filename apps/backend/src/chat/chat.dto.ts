import { ApiPropertyOptional } from '@nestjs/swagger';
import { type EditChatMessageInput, MESSAGE_MAX_LENGTH } from '@strategos/shared';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** `?before=<id>&after=<id>&limit=50` : historique du chat par curseur. */
export class ChatHistoryQueryDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @IsUUID()
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 50 })
  limit: number = 50;
}

/** `PUT /chat-messages/:id` : modifier son message. */
export class EditChatMessageDto implements EditChatMessageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_LENGTH)
  content: string;
}
