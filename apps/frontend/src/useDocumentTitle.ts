import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Titre de l'onglet : « <écran> · Strategos », pour s'y retrouver entre plusieurs onglets. */
export function useDocumentTitle(title: string | undefined): void {
  const { t } = useTranslation();
  const app = t('app.name');
  useEffect(() => {
    document.title = title ? `${title} · ${app}` : app;
    return () => {
      document.title = app;
    };
  }, [title, app]);
}
