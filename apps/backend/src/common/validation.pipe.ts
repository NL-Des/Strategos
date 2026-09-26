import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { ErrorCode } from '@strategos/shared';
import { AppException } from './app-exception.js';

/** `{ "champ": ["isString", …], "parent.enfant": [...] }` : noms des contraintes violées. */
export function toFieldErrors(errors: ValidationError[], prefix = ''): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) fields[path] = Object.keys(error.constraints);
    if (error.children?.length) Object.assign(fields, toFieldErrors(error.children, path));
  }
  return fields;
}

/** Validation des DTO : `400 VALIDATION_FAILED` avec `details.fields`. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, {
        fields: toFieldErrors(errors),
      }),
  });
}
