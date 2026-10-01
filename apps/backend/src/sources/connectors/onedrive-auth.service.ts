import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  AuditAction,
  AuditTargetType,
  ErrorCode,
  type OneDriveStatus,
  SourceStatus,
  SourceType,
} from '@strategos/shared';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/app-exception.js';
import { config } from '../../config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SourceAuthExpiredError, SourceUnavailableError } from '../source-errors.js';
import { OAuthStates } from './oauth-states.js';
import { decryptToken, encryptToken } from './token-crypto.js';

const SCOPES = 'offline_access User.Read Files.ReadWrite';
const EXPIRY_MARGIN_MS = 60_000;

interface Me {
  userPrincipalName?: string;
  displayName?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

const authFailed = () => new AppException(HttpStatus.BAD_REQUEST, ErrorCode.SOURCE_AUTH_FAILED);

/**
 * Connexion OneDrive de l'admin (08) : accès délégué, flux OAuth « code ». Le
 * refresh token est stocké chiffré (`onedrive_credentials`), jamais renvoyé par
 * l'API ; il est renouvelé à chaque rafraîchissement. Un rafraîchissement
 * refusé rend la connexion expirée, signalée dans l'espace admin.
 */
@Injectable()
export class OneDriveAuthService {
  private readonly logger = new Logger(OneDriveAuthService.name);
  private readonly states = new OAuthStates();
  private access: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  configured(): boolean {
    const { clientId, clientSecret } = config.azure;
    return !!(clientId && clientSecret && config.tokenEncryptionKey);
  }

  async status(): Promise<OneDriveStatus> {
    const row = await this.prisma.onedriveCredential.findUnique({ where: { id: 1 } });
    return {
      configured: this.configured(),
      connected: !!row && !row.expiredAt,
      accountLabel: row?.accountLabel ?? null,
      expired: !!row?.expiredAt,
    };
  }

  /** Adresse de connexion chez Microsoft, avec un `state` à usage unique lié à l'admin. */
  connectUrl(userId: string): string {
    if (!this.configured()) throw authFailed();
    const state = this.states.create(userId);
    const { clientId, tenant, redirectUri } = config.azure;
    const params = new URLSearchParams({
      client_id: clientId!,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      state,
    });
    return `${config.apis.microsoftLogin}/${tenant}/oauth2/v2.0/authorize?${params}`;
  }

  /** Retour de Microsoft : `state` vérifié (inconnu, expiré ou déjà utilisé → refus). */
  async callback(code: string | undefined, state: string | undefined): Promise<void> {
    const userId = this.states.consume(state);
    if (!userId || !code) throw authFailed();
    const tokens = await this.token({ grant_type: 'authorization_code', code }).catch(() => {
      throw authFailed();
    });
    if (!tokens.refresh_token) throw authFailed();
    const me: Me = await fetch(`${config.apis.graph}/me?$select=userPrincipalName,displayName`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<Me>) : {}))
      .catch(() => ({}));
    const accountLabel = me.userPrincipalName ?? me.displayName ?? '';
    const encrypted = encryptToken(config.tokenEncryptionKey!, tokens.refresh_token);
    const accessExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await this.prisma.$transaction(async (tx) => {
      const data = {
        accountLabel,
        refreshTokenEncrypted: encrypted,
        accessExpiresAt,
        expiredAt: null,
      };
      await tx.onedriveCredential.upsert({
        where: { id: 1 },
        create: { id: 1, ...data },
        update: data,
      });
      await tx.source.updateMany({
        where: { type: SourceType.onedrive, status: SourceStatus.auth_expired },
        data: { status: SourceStatus.ok },
      });
      await this.audit.record(
        tx,
        { kind: 'user', userId, ip: null },
        {
          action: AuditAction.ONEDRIVE_CONNECT,
          targetType: AuditTargetType.ONEDRIVE,
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
    const row = await this.prisma.onedriveCredential.findUnique({ where: { id: 1 } });
    if (!row || row.expiredAt || !this.configured()) throw new SourceAuthExpiredError(sourceId);
    let tokens: TokenResponse;
    try {
      tokens = await this.token({
        grant_type: 'refresh_token',
        refresh_token: decryptToken(config.tokenEncryptionKey!, row.refreshTokenEncrypted),
      });
    } catch (error) {
      if (!(error instanceof RefusedError)) throw new SourceUnavailableError(sourceId);
      await this.expire();
      throw new SourceAuthExpiredError(sourceId);
    }
    const accessExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await this.prisma.onedriveCredential.update({
      where: { id: 1 },
      data: {
        accessExpiresAt,
        ...(tokens.refresh_token
          ? {
              refreshTokenEncrypted: encryptToken(config.tokenEncryptionKey!, tokens.refresh_token),
            }
          : {}),
      },
    });
    this.access = { value: tokens.access_token, expiresAt: accessExpiresAt.getTime() };
    return tokens.access_token;
  }

  /** Connexion expirée : signalée dans l'espace admin, sources OneDrive en `auth_expired`. */
  private async expire(): Promise<void> {
    this.access = null;
    this.logger.warn('Connexion OneDrive expirée : l’admin doit se reconnecter');
    await this.prisma.$transaction([
      this.prisma.onedriveCredential.update({ where: { id: 1 }, data: { expiredAt: new Date() } }),
      this.prisma.source.updateMany({
        where: { type: SourceType.onedrive, deletedAt: null },
        data: { status: SourceStatus.auth_expired },
      }),
    ]);
  }

  private async token(grant: Record<string, string>): Promise<TokenResponse> {
    const { clientId, clientSecret, tenant, redirectUri } = config.azure;
    const response = await fetch(`${config.apis.microsoftLogin}/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        scope: SCOPES,
        ...grant,
      }),
    });
    // 400 / 401 : jeton révoqué ou expiré (`invalid_grant`) ; le reste est une panne.
    if (response.status === 400 || response.status === 401) throw new RefusedError();
    if (!response.ok) throw new Error(`Microsoft : ${response.status}`);
    return (await response.json()) as TokenResponse;
  }
}

class RefusedError extends Error {}
