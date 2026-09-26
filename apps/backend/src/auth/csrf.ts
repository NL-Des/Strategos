import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Secret aléatoire de 256 bits, encodé en base64url. */
export function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Jeton CSRF dérivé du secret de la session (ou de la pré-session). */
export function deriveCsrfToken(secret: string): string {
  return createHmac('sha256', secret).update('csrf').digest('base64url');
}

export function verifyCsrfToken(secret: string, token: string): boolean {
  const expected = Buffer.from(deriveCsrfToken(secret));
  const received = Buffer.from(token);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
