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
}

/**
 * Adaptateur d'une source connectée (08) : Google Sheets (compte connecté ou
 * lien public) ou OneDrive. Le
 * document en ligne fait foi ; Strategos lit des valeurs et écrit des valeurs
 * brutes, jamais de formule. Une source injoignable lève
 * `SourceUnavailableError`, une connexion expirée `SourceAuthExpiredError`.
 */
export interface SourceConnector {
  metadata(source: Pick<Source, 'id' | 'connectionInfo'>): Promise<SourceMetadata>;
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
