import { useTranslation } from 'react-i18next';

/** État de chargement : indicateur animé et texte, annoncé aux lecteurs d'écran. */
export function Loading({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={`loading ${className}`.trim()} role="status">
      <span className="spinner" aria-hidden="true" />
      {t('common.loading')}
    </p>
  );
}
