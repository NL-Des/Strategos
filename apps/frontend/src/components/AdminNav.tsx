import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import { useDocumentTitle } from '../useDocumentTitle';
import { pendingCount } from '../api/forms';
import { getGoogleStatus, getOneDriveStatus } from '../api/sources';

const LINKS = [
  ['/admin/submissions', 'submissions'],
  ['/admin/pages', 'pages'],
  ['/admin/layout/header', 'header'],
  ['/admin/layout/footer', 'footer'],
  ['/admin/media', 'media'],
  ['/admin/themes', 'themes'],
  ['/admin/templates', 'templates'],
  ['/admin/sources', 'sources'],
  ['/admin/users', 'users'],
  ['/admin/groups', 'groups'],
  ['/admin/rights', 'rights'],
  ['/admin/settings', 'settings'],
  ['/admin/audit', 'audit'],
  ['/admin/trash', 'trash'],
] as const;

/** Soumissions en attente : compteur visible en permanence (04 — Tableau de bord). */
const PENDING_REFRESH_MS = 30_000;

/** Navigation de l'espace d'administration. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const pending = useQuery({
    queryKey: ['admin', 'submissions', 'count'],
    queryFn: pendingCount,
    refetchInterval: PENDING_REFRESH_MS,
  });
  const count = pending.data?.count ?? 0;
  const { pathname } = useLocation();
  const active = LINKS.find(([to]) => pathname.startsWith(to));
  useDocumentTitle(active ? t(`admin.nav.${active[1]}`) : t('admin.title'));
  // Connexion Google ou OneDrive expirée : signalée partout dans l'espace admin (08).
  const google = useQuery({ queryKey: ['admin', 'google'], queryFn: getGoogleStatus });
  const onedrive = useQuery({ queryKey: ['admin', 'onedrive'], queryFn: getOneDriveStatus });
  return (
    <>
      <nav className="admin-nav" aria-label={t('admin.title')}>
        {LINKS.map(([to, key]) => (
          <NavLink key={to} to={to}>
            {t(`admin.nav.${key}`)}
            {key === 'submissions' && count > 0 && (
              <span className="badge" aria-label={t('submissions.admin.pendingCount', { count })}>
                {count}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      {google.data?.expired && (
        <p className="notice warning" role="alert">
          {t('sources.gsheet.expired')}{' '}
          <NavLink to="/admin/sources">{t('sources.gsheet.reconnect')}</NavLink>
        </p>
      )}
      {onedrive.data?.expired && (
        <p className="notice warning" role="alert">
          {t('sources.onedrive.expired')}{' '}
          <NavLink to="/admin/sources">{t('sources.onedrive.reconnect')}</NavLink>
        </p>
      )}
      {children}
    </>
  );
}
