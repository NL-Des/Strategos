import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import { pendingCount } from '../api/forms';
import { getGoogleStatus, getOneDriveStatus } from '../api/sources';
import { useDocumentTitle } from '../useDocumentTitle';
import { Icon, type IconName } from './Icon';
import { Notice } from './Notice';

/** Écrans de l'administration, regroupés par domaine (04 — Navigation). */
const GROUPS: { key: string; links: [to: string, key: string, icon: IconName][] }[] = [
  { key: 'activity', links: [['/admin/submissions', 'submissions', 'inbox']] },
  {
    key: 'content',
    links: [
      ['/admin/pages', 'pages', 'file'],
      ['/admin/layout/header', 'header', 'layout'],
      ['/admin/layout/footer', 'footer', 'layout'],
      ['/admin/media', 'media', 'image'],
      ['/admin/themes', 'themes', 'palette'],
      ['/admin/templates', 'templates', 'copy'],
    ],
  },
  { key: 'data', links: [['/admin/sources', 'sources', 'database']] },
  {
    key: 'access',
    links: [
      ['/admin/users', 'users', 'user'],
      ['/admin/groups', 'groups', 'users'],
      ['/admin/rights', 'rights', 'shield'],
    ],
  },
  {
    key: 'system',
    links: [
      ['/admin/settings', 'settings', 'settings'],
      ['/admin/audit', 'audit', 'history'],
      ['/admin/trash', 'trash', 'trash'],
    ],
  },
];
const LINKS = GROUPS.flatMap((group) => group.links);

/** Soumissions en attente : compteur visible en permanence (04 — Tableau de bord). */
const PENDING_REFRESH_MS = 30_000;

/**
 * Cadre de l'espace d'administration : menu latéral regroupé sur grand écran,
 * replié derrière un bouton « Menu » sur mobile et tablette.
 */
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

  // Menu mobile : ouvert par le bouton, refermé dès qu'on choisit un écran.
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <button
          type="button"
          className="secondary admin-menu-toggle"
          aria-expanded={open}
          aria-controls="admin-nav"
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'x' : 'menu'} />
          {t('admin.menu')}
          {active && <span className="muted"> · {t(`admin.nav.${active[1]}`)}</span>}
          {!open && count > 0 && <span className="badge">{count}</span>}
        </button>
        <nav
          id="admin-nav"
          className={open ? 'admin-nav open' : 'admin-nav'}
          aria-label={t('admin.title')}
        >
          {GROUPS.map((group) => (
            <div key={group.key} className="admin-nav-group">
              <p className="admin-nav-title">{t(`admin.navGroups.${group.key}`)}</p>
              {group.links.map(([to, key, icon]) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)}>
                  <Icon name={icon} />
                  {t(`admin.nav.${key}`)}
                  {key === 'submissions' && count > 0 && (
                    <span
                      className="badge"
                      aria-label={t('submissions.admin.pendingCount', { count })}
                    >
                      {count}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="admin-content">
        {google.data?.expired && (
          <Notice tone="warning" role="alert">
            {t('sources.gsheet.expired')}{' '}
            <NavLink to="/admin/sources">{t('sources.gsheet.reconnect')}</NavLink>
          </Notice>
        )}
        {onedrive.data?.expired && (
          <Notice tone="warning" role="alert">
            {t('sources.onedrive.expired')}{' '}
            <NavLink to="/admin/sources">{t('sources.onedrive.reconnect')}</NavLink>
          </Notice>
        )}
        {children}
      </div>
    </div>
  );
}
