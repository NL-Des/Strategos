import type { FormMode, TemplateType } from './enums.js';
import type { FormDefinition } from './forms/definition.js';
import type { PageConfig } from './pages/structure.js';

/** Modèles réutilisables (10 — Modèles et duplication ; 13 — routes Modèles). */

export const TEMPLATE_NAME_MAX_LENGTH = 100;

/** Ligne de la bibliothèque (`GET /admin/templates`). */
export interface TemplateSummary {
  id: string;
  type: TemplateType;
  name: string;
  createdAt: string;
  /** Résumé : mode et nombre de champs d'un formulaire, modules d'une page, titre d'un sujet. */
  details: { mode?: FormMode; fields?: number; blocks?: number; title?: string };
}

/**
 * Formulaire : champs, libellés et types, sans mapping (cellules, colonnes,
 * feuille, zone d'ajout, clé, bloc relié, listes lues dans le document).
 */
export interface FormTemplatePayload {
  mode: FormMode;
  definition: FormDefinition;
}

/**
 * Page : structure du brouillon, sans plages ni valeurs insérées ; chaque bloc
 * `form` retrouve sa définition dans `forms`, par id de bloc.
 */
export interface PageTemplatePayload {
  config: PageConfig;
  forms: Record<string, FormTemplatePayload>;
}

/** Sujet : titre type et message d'ouverture. */
export interface TopicTemplatePayload {
  title: string;
  message: string;
}

/** Résultat d'une instanciation : la ressource créée. */
export type InstantiateResult =
  | { type: 'page'; pageId: string }
  | { type: 'form'; formId: string }
  | { type: 'topic'; topicId: string; spaceId: string };
