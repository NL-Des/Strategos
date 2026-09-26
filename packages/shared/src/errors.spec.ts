import { describe, expect, it } from 'vitest';
import { ErrorCode, isApiError } from './errors.js';

describe('isApiError', () => {
  it('reconnaît le format commun', () => {
    expect(isApiError({ code: ErrorCode.NOT_FOUND, message: 'x', details: {} })).toBe(true);
  });

  it('refuse un code inconnu ou un format incomplet', () => {
    expect(isApiError({ code: 'NOPE', message: 'x', details: {} })).toBe(false);
    expect(isApiError({ code: ErrorCode.NOT_FOUND, message: 'x' })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
