import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

/** Navigation de l'espace d'administration. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <nav className="admin-nav" aria-label={t('admin.title')}>
        <NavLink to="/admin/users">{t('admin.nav.users')}</NavLink>
        <NavLink to="/admin/audit">{t('admin.nav.audit')}</NavLink>
      </nav>
      {children}
    </>
  );
}
