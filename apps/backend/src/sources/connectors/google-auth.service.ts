import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { config } from '../../config.js';
import { SourceUnavailableError } from '../source-errors.js';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
/** Marge avant l'expiration d'un jeton d'accès, pour ne pas l'utiliser trop tard. */
const EXPIRY_MARGIN_MS = 60_000;

const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/**
 * Compte de service Google (08) : sa clé est un fichier secret monté dans le
 * conteneur (`GOOGLE_SERVICE_ACCOUNT_FILE`), jamais en base. Le jeton d'accès
 * est obtenu par un JWT signé (RS256) et gardé en mémoire jusqu'à son expiration.
 * Tant qu'aucune clé valide n'est trouvée, le fichier est relu à chaque besoin :
 * il peut être déposé sans redémarrer le backend.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private key: ServiceAccountKey | null = null;
  /** Évite de journaliser la même clé illisible à chaque relecture. */
  private reportedInvalid = false;
  private token: { value: string; expiresAt: number } | null = null;

  /** Adresse avec laquelle partager les Sheets ; `null` si la clé n'est pas configurée. */
  email(): string | null {
    return this.readKey()?.client_email ?? null;
  }

  async accessToken(sourceId: string): Promise<string> {
    if (this.token && this.token.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return this.token.value;
    const key = this.readKey();
    if (!key) throw new SourceUnavailableError(sourceId);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
      JSON.stringify({
        iss: key.client_email,
        scope: SCOPE,
        aud: config.apis.googleToken,
        iat: now,
        exp: now + 3600,
      }),
    )}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
    let response: Response;
    try {
      response = await fetch(config.apis.googleToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: `${unsigned}.${base64url(signature)}`,
        }),
      });
    } catch {
      throw new SourceUnavailableError(sourceId);
    }
    if (!response.ok) {
      this.logger.error(`Jeton Google refusé (${response.status})`);
      throw new SourceUnavailableError(sourceId);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private readKey(): ServiceAccountKey | null {
    if (this.key) return this.key;
    const file = config.googleServiceAccountFile;
    if (!file) return null;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      return null; // pas encore déposée
    }
    try {
      const parsed = JSON.parse(content) as Partial<ServiceAccountKey>;
      if (parsed.client_email && parsed.private_key) {
        this.key = { client_email: parsed.client_email, private_key: parsed.private_key };
        return this.key;
      }
    } catch {
      // traité comme une clé incomplète
    }
    if (!this.reportedInvalid) {
      this.logger.error(`Clé du compte de service illisible : ${file}`);
      this.reportedInvalid = true;
    }
    return null;
  }
}
