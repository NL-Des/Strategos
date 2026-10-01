import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useDocumentTitle } from '../useDocumentTitle';
import { BlankScreen } from './BlankScreen';

/**
 * Page inconnue ou illisible : le même écran dans les deux cas, pour ne pas
 * révéler qu'une page existe (13 — ressource illisible → 404).
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('notFound.title'));
  return (
    <BlankScreen icon="search" title={t('notFound.title')}>
      <p>{t('errors.NOT_FOUND')}</p>
      <Link className="button" to="/">
        {t('notFound.home')}
      </Link>
    </BlankScreen>
  );
}
