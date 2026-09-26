import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Auteur d'une action tracée : un compte, le système (tâches, validation automatique) ou la commande serveur. */
export type AuditActor =
  { kind: 'user'; userId: string; ip: string | null } | { kind: 'system' } | { kind: 'cli' };

export const SYSTEM_ACTOR: AuditActor = { kind: 'system' };
export const CLI_ACTOR: AuditActor = { kind: 'cli' };

export function actorFromRequest(req: Request): AuditActor {
  return { kind: 'user', userId: req.auth!.user.id, ip: req.ip ?? null };
}

/** Compte connecté, comme auteur d'une action tracée ; derrière `AuthGuard` seulement. */
export const Actor = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuditActor =>
  actorFromRequest(ctx.switchToHttp().getRequest<Request>()),
);
