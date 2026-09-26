import { HttpException } from '@nestjs/common';
import type { ApiError, ErrorCode } from '@strategos/shared';
import { ERROR_MESSAGES } from './error-messages.js';

/** Erreur métier au format commun `{ code, message, details }` (13 — Codes de retour et erreurs). */
export class AppException extends HttpException {
  constructor(status: number, code: ErrorCode, details: Record<string, unknown> = {}) {
    const body: ApiError = { code, message: ERROR_MESSAGES[code], details };
    super(body, status);
  }

  getBody(): ApiError {
    return this.getResponse() as ApiError;
  }
}
