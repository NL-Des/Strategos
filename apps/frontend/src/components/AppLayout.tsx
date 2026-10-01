import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AccountMenu } from './AccountMenu';
import { Icon } from './Icon';

/** Cadre des écrans hors page builder (administration, changement d'identifiants). */
export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          {t('app.name')}
        </Link>
        <div className="topbar-end">
          <Link to="/" className="topbar-link">
            <Icon name="home" />
            {t('app.backToSite')}
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="page wide">{children}</main>
    </>
  );
}
