import type { Source } from '../../generated/prisma/client.js';
import { SourceUnavailableError } from '../source-errors.js';
import type { CellWrite } from '../source-write.service.js';
import type { RemoteCell } from './cells.js';

/** Feuille lue dans une source connectée : cellules non vides par `positionKey`. */
export type RemoteSheet = Map<string, RemoteCell>;

/** Nom et feuilles d'un document, lus à l'ajout et au test d'accès. */
export interface SourceMetadata {
  name: string;
  sheets: string[];
  /** Ce que l'adaptateur veut garder dans `connection_info` (version du script déployé). */
  info?: Record<string, unknown>;
}

/** Ce qu'il faut pour joindre un document : une source, ou celle qu'on s'apprête à créer. */
export type SourceRef = Pick<Source, 'id' | 'connectionInfo'> & {
  connectionSecret?: Source['connectionSecret'];
};

/**
 * Adaptateur d'une source connectée (08) : Google Sheets (compte connecté,
 * lien public ou script) ou OneDrive. Le
 * document en ligne fait foi ; Strategos lit des valeurs et écrit des valeurs
 * brutes. Seule la grille de l'admin écrit une formule, dans un Google Sheet
 * (compte connecté ou script), que Google calcule. Une source injoignable lève
 * `SourceUnavailableError`, une connexion expirée `SourceAuthExpiredError`.
 */
export interface SourceConnector {
  metadata(source: SourceRef): Promise<SourceMetadata>;
  fetchSheet(source: Source, sheet: string): Promise<RemoteSheet>;
  write(source: Source, writes: CellWrite[]): Promise<void>;
  /** Vide le cache propre à l'adaptateur, s'il en tient un. */
  invalidate?(sourceId: string): void;
}

/**
 * Appel JSON à une API externe. Une panne réseau ou un refus (`403`, `404`…)
 * rend la source injoignable ; `onStatus` traite un statut particulier.
 */
export async function callApi<T>(
  sourceId: string,
  url: string,
  init: RequestInit,
  onStatus?: (status: number) => Error | undefined,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new SourceUnavailableError(sourceId);
  }
  if (!response.ok) {
    throw onStatus?.(response.status) ?? new SourceUnavailableError(sourceId);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
