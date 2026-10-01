import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type GoogleConfigInput,
  type GooglePickerSession,
  type GoogleStatus,
  SourceStatus,
  SourceType,
} from '@strategos/shared';
import type { AuditActor } from '../../audit/audit-actor.js';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/app-exception.js';
import { config } from '../../config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SourceAuthExpiredError, SourceUnavailableError } from '../source-errors.js';
import { OAuthStates } from './oauth-states.js';
import { decryptToken, encryptToken } from './token-crypto.js';

/**
 * `drive.file` : seulement les fichiers que l'admin choisit dans le sélecteur de
 * Google, jamais le reste de son Drive. `email` : le compte affiché dans l'espace admin.
 */
const SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';
const EXPIRY_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** Identifiants du projet Google Cloud, secret en clair, tels qu'ils sont envoyés à Google. */
interface GoogleAppCredentials {
  clientId: string;
  clientSecret: string;
  apiKey: string | null;
  /** Fournis au déploiement : non modifiables depuis l'écran Sources. */
  managed: boolean;
}

const authFailed = () => new AppException(HttpStatus.BAD_REQUEST, ErrorCode.SOURCE_AUTH_FAILED);

/**
 * Connexion Google de l'admin (08) : accès délégué, flux OAuth « code ». Les
 * identifiants du projet Google Cloud sont ceux du déploiement s'il les fournit,
 * sinon ceux saisis par l'admin (`google_app`) ;
 * le secret du client et le refresh token (`google_credentials`) sont stockés
 * chiffrés, jamais renvoyés par l'API. Un rafraîchissement refusé rend la
 * connexion expirée, signalée dans l'espace admin.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly states = new OAuthStates();
  private access: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Identifiants du projet Google Cloud : ceux du déploiement ont priorité ;
   * sinon ceux saisis par l'admin. `null` s'il n'y en a pas, ou si le secret
   * est illisible (clé de chiffrement perdue) : ils sont alors à ressaisir.
   */
  private async credentials(): Promise<GoogleAppCredentials | null> {
    const { clientId, clientSecret, apiKey } = config.google;
    if (clientId && clientSecret) return { clientId, clientSecret, apiKey, managed: true };
    const app = await this.prisma.googleApp.findUnique({ where: { id: 1 } });
    if (!app) return null;
    try {
      return {
        clientId: app.clientId,
        clientSecret: decryptToken(config.tokenEncryptionKey, app.clientSecretEncrypted),
        apiKey: app.apiKey,
        managed: false,
      };
    } catch {
      return null;
    }
  }

  async status(): Promise<GoogleStatus> {
    const [app, row] = await Promise.all([
      this.credentials(),
      this.prisma.googleCredential.findUnique({ where: { id: 1 } }),
    ]);
    return {
      configured: !!app,
      managed: app?.managed ?? false,
      clientId: app?.clientId ?? null,
      hasApiKey: !!app?.apiKey,
      redirectUri: config.google.redirectUri,
      connected: !!row && !row.expiredAt,
      accountLabel: row?.accountLabel ?? null,
      expired: !!row?.expiredAt,
    };
  }

  /**
   * Saisie des identifiants par l'admin. Le jeton de la connexion en cours est
   * lié au client OAuth : changer d'identifiant de client la rend expirée.
   */
  async configure(input: GoogleConfigInput, actor: AuditActor): Promise<GoogleStatus> {
    if ((await this.credentials())?.managed) {
      throw new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
    }
    const data = {
      clientId: input.clientId,
      clientSecretEncrypted: encryptToken(config.tokenEncryptionKey, input.clientSecret),
      apiKey: input.apiKey || null,
    };
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.googleApp.findUnique({ where: { id: 1 } });
      await tx.googleApp.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
      if (before && before.clientId !== input.clientId) {
        const { count } = await tx.googleCredential.updateMany({
          where: { expiredAt: null },
          data: { expiredAt: new Date() },
        });
        if (count > 0) {
          await tx.source.updateMany({
            where: { type: SourceType.gsheet, deletedAt: null },
            data: { status: SourceStatus.auth_expired },
          });
        }
      }
      await this.audit.record(tx, actor, {
        action: AuditAction.GOOGLE_CONFIGURE,
        targetType: AuditTargetType.GOOGLE,
        ...(before ? { before: { clientId: before.clientId } } : {}),
        after: { clientId: input.clientId },
      });
    });
    this.access = null;
    return this.status();
  }

  /** Adresse de connexion chez Google, avec un `state` à usage unique lié à l'admin. */
  async connectUrl(userId: string): Promise<string> {
    const app = await this.credentials();
    if (!app) throw authFailed();
    const params = new URLSearchParams({
      client_id: app.clientId,
      response_type: 'code',
      redirect_uri: config.google.redirectUri,
      scope: SCOPES,
      // Sans ces deux réglages, Google ne renvoie un refresh token qu'à la première connexion.
      access_type: 'offline',
      prompt: 'consent',
      state: this.states.create(userId),
    });
    return `${config.apis.googleAuth}?${params}`;
  }

  /** Retour de Google : `state` vérifié (inconnu, expiré ou déjà utilisé → refus). */
  async callback(code: string | undefined, state: string | undefined): Promise<void> {
    const userId = this.states.consume(state);
    if (!userId || !code) throw authFailed();
    const tokens = await this.token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.google.redirectUri,
    }).catch(() => {
      throw authFailed();
    });
    if (!tokens.refresh_token) throw authFailed();
    const me: { email?: string } = await fetch(config.apis.googleUserinfo, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ email?: string }>) : {}))
      .catch(() => ({}));
    const accountLabel = me.email ?? '';
    const encrypted = encryptToken(config.tokenEncryptionKey, tokens.refresh_token);
    const accessExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await this.prisma.$transaction(async (tx) => {
      const data = {
        accountLabel,
        refreshTokenEncrypted: encrypted,
        accessExpiresAt,
        expiredAt: null,
      };
      await tx.googleCredential.upsert({
        where: { id: 1 },
        create: { id: 1, ...data },
        update: data,
      });
      await tx.source.updateMany({
        where: { type: SourceType.gsheet, status: SourceStatus.auth_expired },
        data: { status: SourceStatus.ok },
      });
      await this.audit.record(
        tx,
        { kind: 'user', userId, ip: null },
        {
          action: AuditAction.GOOGLE_CONNECT,
          targetType: AuditTargetType.GOOGLE,
          after: { accountLabel },
        },
      );
    });
    this.access = { value: tokens.access_token, expiresAt: accessExpiresAt.getTime() };
  }

  /** Jeton d'accès délégué, rafraîchi si besoin. */
  async accessToken(sourceId: string): Promise<string> {
    if (this.access && this.access.expiresAt - EXPIRY_MARGIN_MS > Date.now())
      return this.access.value;
    const row = await this.prisma.googleCredential.findUnique({ where: { id: 1 } });
    if (!row || row.expiredAt) throw new SourceAuthExpiredError(sourceId);
    let tokens: TokenResponse;
    try {
      tokens = await this.token({
        grant_type: 'refresh_token',
        refresh_token: decryptToken(config.tokenEncryptionKey, row.refreshTokenEncrypted),
      });
    } catch (error) {
      if (!(error instanceof RefusedError)) throw new SourceUnavailableError(sourceId);
      await this.expire();
      throw new SourceAuthExpiredError(sourceId);
    }
    const accessExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await this.prisma.googleCredential.update({ where: { id: 1 }, data: { accessExpiresAt } });
    this.access = { value: tokens.access_token, expiresAt: accessExpiresAt.getTime() };
    return tokens.access_token;
  }

  /**
   * Ce qu'il faut au sélecteur de fichiers Google, ouvert dans le navigateur de
   * l'admin : un jeton d'accès court, la clé d'API et le numéro du projet
   * (le préfixe de l'identifiant du client OAuth).
   */
  async pickerSession(): Promise<GooglePickerSession> {
    const accessToken = await this.accessToken('google');
    const app = (await this.credentials())!;
    return { accessToken, apiKey: app.apiKey, appId: app.clientId.split('-')[0]! };
  }

  /** Connexion expirée : signalée dans l'espace admin, Google Sheets en `auth_expired`. */
  private async expire(): Promise<void> {
    this.access = null;
    this.logger.warn('Connexion Google expirée : l’admin doit se reconnecter');
    await this.prisma.$transaction([
      this.prisma.googleCredential.update({ where: { id: 1 }, data: { expiredAt: new Date() } }),
      this.prisma.source.updateMany({
        where: { type: SourceType.gsheet, deletedAt: null },
        data: { status: SourceStatus.auth_expired },
      }),
    ]);
  }

  private async token(grant: Record<string, string>): Promise<TokenResponse> {
    const app = await this.credentials();
    if (!app) throw new RefusedError();
    const response = await fetch(config.apis.googleToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        ...grant,
      }),
    });
    // 400 / 401 : jeton révoqué ou expiré (`invalid_grant`) ; le reste est une panne.
    if (response.status === 400 || response.status === 401) throw new RefusedError();
    if (!response.ok) throw new Error(`Google : ${response.status}`);
    return (await response.json()) as TokenResponse;
  }
}

class RefusedError extends Error {}
