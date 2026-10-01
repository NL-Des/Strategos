import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Chiffrement des jetons Google et OneDrive en base (08) : AES-256-GCM, clé fournie au
 * déploiement. Format : IV (12 octets) · étiquette (16 octets) · texte chiffré.
 */
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptToken(key: Buffer, plaintext: string): Uint8Array<ArrayBuffer> {
  if (key.length !== 32) throw new Error('La clé de chiffrement doit faire 32 octets');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Uint8Array.from(Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
}

/** Lève une erreur si la clé est fausse ou le contenu altéré. */
export function decryptToken(key: Buffer, payload: Uint8Array): string {
  const data = Buffer.from(payload);
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, IV_BYTES));
  decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([
    decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
