import {
  type EditMessageInput,
  MESSAGE_MAX_LENGTH,
  type OpenTopicInput,
  type PatchTopicInput,
  type PinTopicInput,
  type PostMessageInput,
  TOPIC_TITLE_MAX_LENGTH,
} from '@strategos/shared';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

class AttachmentIdsDto {
  // La limite de 4 par message est vérifiée dans le service (→ `422 TOO_MANY_ATTACHMENTS`) ;
  // ce plafond large ne borne que la taille de la requête.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}

export class OpenTopicDto extends AttachmentIdsDto implements OpenTopicInput {
  @IsString()
  @MinLength(1)
  @MaxLength(TOPIC_TITLE_MAX_LENGTH)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_LENGTH)
  firstMessage: string;
}

export class PostMessageDto extends AttachmentIdsDto implements PostMessageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_LENGTH)
  content: string;
}

export class EditMessageDto implements EditMessageInput {
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_MAX_LENGTH)
  content: string;
}

/** `PATCH /topics/:id` côté utilisateur : renommer et/ou clore (auteur ou admin). */
export class PatchTopicDto implements PatchTopicInput {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(TOPIC_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

/** `PATCH /admin/topics/:id` : épingler ou désépingler. */
export class PinTopicDto implements PinTopicInput {
  @IsBoolean()
  pinned: boolean;
}
