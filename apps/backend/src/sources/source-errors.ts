import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@strategos/shared';
import { AppException } from '../common/app-exception.js';

/** La source n'existe plus, est retirée ou injoignable (`SOURCE_UNAVAILABLE`). */
export class SourceUnavailableError extends Error {
  constructor(readonly sourceId: string) {
    super(`Source ${sourceId} indisponible`);
  }
}

/** Connexion OneDrive expirée : l'admin doit se reconnecter (`SOURCE_AUTH_EXPIRED`). */
export class SourceAuthExpiredError extends SourceUnavailableError {}

/** Erreur d'API d'une source injoignable : `503`, avec le code qui dit pourquoi. */
export function sourceException(error: SourceUnavailableError): AppException {
  return new AppException(
    HttpStatus.SERVICE_UNAVAILABLE,
    error instanceof SourceAuthExpiredError
      ? ErrorCode.SOURCE_AUTH_EXPIRED
      : ErrorCode.SOURCE_UNAVAILABLE,
  );
}
