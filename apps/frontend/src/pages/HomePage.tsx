import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe } from '../auth/useMe';
import { BlankScreen } from './BlankScreen';
import { PageView } from './PageView';

/** Accueil : la page d'arrivée désignée par l'admin (04 — Réglages de l'instance). */
export function HomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  if (me?.landingPageId) return <PageView pageId={me.landingPageId} landing />;
  return (
    <BlankScreen icon="home" title={t(me?.isAdmin ? 'app.name' : 'home.noSpaceTitle')}>
      <p>{t(me?.isAdmin ? 'home.noLandingPage' : 'home.noSpace')}</p>
      {me?.isAdmin ? (
        <Link className="button" to="/admin/settings">
          {t('home.configureLanding')}
        </Link>
      ) : (
        <p>{t('home.noSpaceHint')}</p>
      )}
    </BlankScreen>
  );
}
