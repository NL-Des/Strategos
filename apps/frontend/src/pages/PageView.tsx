import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client';
import { getLayout, getPage } from '../api/pages';
import { AccountMenu } from '../components/AccountMenu';
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

  if (page.isPending) return <Loading className="page" />;
  if (page.error) {
    const notFound = page.error instanceof ApiRequestError && page.error.status === 404;
    return (
      <main className="page narrow">
        <AccountMenu />
        {notFound ? (
          <p>{t(landing ? 'home.noSpace' : 'errors.NOT_FOUND')}</p>
        ) : (
          <ErrorMessage error={page.error} />
        )}
      </main>
    );
  }
  return <PageRender page={page.data} layout={layout.data ?? null} />;
}
