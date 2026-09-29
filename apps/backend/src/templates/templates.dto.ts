import { TEMPLATE_NAME_MAX_LENGTH, TemplateType } from '@strategos/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsIn(Object.values(TemplateType))
  type?: TemplateType;
}

/** Enregistrer une réalisation existante comme modèle (13 — Modèles). */
export class CreateTemplateDto {
  @IsIn(Object.values(TemplateType))
  type: TemplateType;

  /** Formulaire, page ou sujet copié. */
  @IsUUID()
  sourceId: string;

  @Transform(trim)
  @IsString()
  @Length(1, TEMPLATE_NAME_MAX_LENGTH)
  name: string;
}

/**
 * Instanciation : page → `name` facultatif (nom du modèle sinon) ; formulaire
 * → `pageId` et `pageBlockId` du bloc du brouillon ; sujet → `spaceId`.
 */
export class InstantiateTemplateDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsUUID()
  pageId?: string;

  @IsOptional()
  @IsUUID()
  pageBlockId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
