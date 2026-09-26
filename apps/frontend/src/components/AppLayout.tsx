import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { AccountMenu } from './AccountMenu';

/** Cadre des écrans hors page builder (administration, changement d'identifiants). */
export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          {t('app.name')}
        </Link>
        <AccountMenu />
      </header>
      <main className="page wide">{children}</main>
    </>
  );
}
