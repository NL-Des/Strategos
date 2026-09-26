import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe } from '../auth/useMe';
import { AccountMenu } from '../components/AccountMenu';
import { PageView } from './PageView';

/** Accueil : la page d'arrivée désignée par l'admin (04 — Réglages de l'instance). */
export function HomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  if (me?.landingPageId) return <PageView pageId={me.landingPageId} />;
  return (
    <main className="page narrow">
      <AccountMenu />
      <h1>{t('app.name')}</h1>
      <p>{t('home.noLandingPage')}</p>
      {me?.isAdmin && (
        <p>
          <Link to="/admin/settings">{t('home.configureLanding')}</Link>
        </p>
      )}
    </main>
  );
}
