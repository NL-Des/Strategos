import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@strategos/shared';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppException } from './app-exception.js';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('renvoie telle quelle une AppException', () => {
    const exception = new AppException(HttpStatus.CONFLICT, ErrorCode.EDIT_CONFLICT, {
      version: 3,
    });
    expect(filter.toApiError(exception)).toEqual({
      status: 409,
      body: { code: 'EDIT_CONFLICT', message: expect.any(String), details: { version: 3 } },
    });
  });

  it('traduit les exceptions de Nest vers un code stable', () => {
    expect(filter.toApiError(new NotFoundException('Cannot GET /x')).body.code).toBe(
      ErrorCode.NOT_FOUND,
    );
    expect(filter.toApiError(new BadRequestException()).body.code).toBe(
      ErrorCode.VALIDATION_FAILED,
    );
  });

  it('masque la cause d’une erreur inattendue', () => {
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    const { status, body } = filter.toApiError(new Error('mot de passe de la base : secret'));
    expect(status).toBe(500);
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String), details: {} });
    expect(body.message).not.toContain('secret');
  });
});
