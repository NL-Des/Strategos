import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

const LINKS = [
  ['/admin/pages', 'pages'],
  ['/admin/layout/header', 'header'],
  ['/admin/layout/footer', 'footer'],
  ['/admin/media', 'media'],
  ['/admin/users', 'users'],
  ['/admin/groups', 'groups'],
  ['/admin/rights', 'rights'],
  ['/admin/settings', 'settings'],
  ['/admin/audit', 'audit'],
] as const;

/** Navigation de l'espace d'administration. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <nav className="admin-nav" aria-label={t('admin.title')}>
        {LINKS.map(([to, key]) => (
          <NavLink key={to} to={to}>
            {t(`admin.nav.${key}`)}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}
