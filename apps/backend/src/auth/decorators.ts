import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from './request-context.js';

export const IS_PUBLIC = 'auth:public';
export const ALLOW_PENDING_CREDENTIALS = 'auth:allowPendingCredentials';
export const IS_ADMIN = 'auth:admin';

/** Route accessible sans session (`AuthGuard` ne s'applique pas). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route accessible même quand le changement d'identifiants est exigé. */
export const AllowPendingCredentials = () => SetMetadata(ALLOW_PENDING_CREDENTIALS, true);

/**
 * Route ou contrôleur réservé à l'admin (`AdminGuard`). À poser sur toute route
 * sous `admin/` : un test vérifie qu'aucune n'y échappe.
 */
export const AdminOnly = () => SetMetadata(IS_ADMIN, true);

/** Session courante ; n'est défini que derrière `AuthGuard`. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext =>
    ctx.switchToHttp().getRequest<Request>().auth!,
);
