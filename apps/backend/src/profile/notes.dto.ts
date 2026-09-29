import { NOTE_CONTENT_MAX_LENGTH, NOTE_TITLE_MAX_LENGTH } from '@strategos/shared';
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Création ou modification d'une note ; `content` est nettoyé par le service. */
export class NoteDto {
  @Transform(trim)
  @IsString()
  @Length(1, NOTE_TITLE_MAX_LENGTH)
  title: string;

  @IsString()
  @MaxLength(NOTE_CONTENT_MAX_LENGTH)
  content: string;
}
