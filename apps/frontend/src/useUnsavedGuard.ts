import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';
import { useConfirm } from './components/Dialog';

/**
 * Brouillon non enregistré : la navigation vers un autre écran demande
 * confirmation, et le navigateur prévient avant de fermer ou recharger l'onglet.
 */
export function useUnsavedGuard(dirty: boolean): void {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: t('builder.leaveConfirm'),
      message: t('builder.leaveHint'),
      confirmLabel: t('builder.leave'),
      danger: true,
    }).then((leave) => (leave ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm, t]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
