import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Chiffrement des secrets gardés en base (08) : jetons Google et OneDrive, secret
 * du client Google. AES-256-GCM. Format : IV (12 octets) · étiquette (16 octets) · texte chiffré.
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

const KEY_FILE = 'token-encryption.key';
const generated = new Map<string, Buffer>();

/**
 * Clé de chiffrement de l'instance : celle fournie au déploiement (base64) a
 * priorité ; sinon une clé est créée une fois dans `keysDir`, hors de la base et
 * des sauvegardes, puis relue à chaque démarrage. Sans cette clé, les secrets
 * en base sont illisibles : l'admin les ressaisit et reconnecte ses comptes.
 */
export function loadEncryptionKey(provided: string | undefined, keysDir: string): Buffer {
  if (provided) return Buffer.from(provided, 'base64');
  const file = join(keysDir, KEY_FILE);
  let key = generated.get(file);
  if (!key) {
    try {
      key = readFileSync(file);
    } catch {
      mkdirSync(keysDir, { recursive: true });
      key = randomBytes(32);
      writeFileSync(file, key, { mode: 0o600, flag: 'wx' });
    }
    generated.set(file, key);
  }
  return key;
}
