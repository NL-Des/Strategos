import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { useMe } from './useMe';

/**
 * Accès aux écrans connectés : sans session → connexion ; identifiants
 * temporaires → changement forcé. Le backend applique les mêmes règles.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: me, isPending } = useMe();
  const { pathname } = useLocation();

  if (isPending) return <p className="page">{t('common.loading')}</p>;
  if (!me) return <Navigate to="/login" replace />;
  if (me.mustChangeCredentials && pathname !== '/change-credentials') {
    return <Navigate to="/change-credentials" replace />;
  }
  return children;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  if (!me?.isAdmin) return <Navigate to="/" replace />;
  return children;
}
