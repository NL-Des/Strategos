import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type ApiError, ErrorCode, isApiError } from '@strategos/shared';
import type { Response } from 'express';
import { ERROR_MESSAGES } from './error-messages.js';

/** Statuts levés par Nest ou Express eux-mêmes, traduits vers un code stable. */
const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.FILE_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_FILE_TYPE,
};

/**
 * Toute erreur sort au format `{ code, message, details }`. Une erreur inattendue
 * devient `500 INTERNAL_ERROR` sans rien révéler de sa cause, qui est journalisée.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);
    response.status(status).json(body);
  }

  toApiError(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (isApiError(payload)) return { status, body: payload };

      const code = CODE_BY_STATUS[status];
      if (code) return { status, body: { code, message: ERROR_MESSAGES[code], details: {} } };
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : exception,
    );
    const code = ErrorCode.INTERNAL_ERROR;
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code, message: ERROR_MESSAGES[code], details: {} },
    };
  }
}
