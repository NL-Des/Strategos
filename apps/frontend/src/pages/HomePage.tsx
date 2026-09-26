import { useTranslation } from 'react-i18next';
import { useMe } from '../auth/useMe';

/** Accueil provisoire : la page d'arrivée construite par l'admin arrive à l'étape 3. */
export function HomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <section>
      <h1>{t('home.welcome', { username: me?.username })}</h1>
      <p>{t('home.placeholder')}</p>
    </section>
  );
}
