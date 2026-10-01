import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';
import { getLayout, getPage } from '../api/pages';
import { BlankScreen } from './BlankScreen';
import { NotFoundPage } from './NotFoundPage';
import { useDocumentTitle } from '../useDocumentTitle';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageRender } from '../render/PageRender';
import { Loading } from '../components/Loading';

/**
 * Page publiée, vue par un utilisateur. Une page d'arrivée illisible affiche
 * l'écran neutre « Aucun espace ne vous est encore attribué » (03).
 */
export function PageView({ pageId, landing = false }: { pageId: string; landing?: boolean }) {
  const { t } = useTranslation();
  const page = useQuery({ queryKey: ['page', pageId], queryFn: () => getPage(pageId) });
  const layout = useQuery({ queryKey: ['layout'], queryFn: getLayout });
  useDocumentTitle(page.data?.name);

  // Le header arrive avec la page : sans cette attente, il apparaît après coup et décale tout.
  if (page.isPending || layout.isPending) return <Loading className="page" />;
  if (page.error) {
    const notFound = page.error instanceof ApiRequestError && page.error.status === 404;
    if (notFound && !landing) return <NotFoundPage />;
    return (
      <BlankScreen icon="home" title={t(notFound ? 'home.noSpaceTitle' : 'app.name')}>
        {notFound ? (
          <>
            <p>{t('home.noSpace')}</p>
            <p>{t('home.noSpaceHint')}</p>
          </>
        ) : (
          <ErrorMessage error={page.error} />
        )}
      </BlankScreen>
    );
  }
  return <PageRender page={page.data} layout={layout.data ?? null} />;
}
