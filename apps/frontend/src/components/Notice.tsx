import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type NoticeTone = 'success' | 'info' | 'warning' | 'error';

const ICONS: Record<NoticeTone, IconName> = {
  success: 'checkCircle',
  info: 'info',
  warning: 'alert',
  error: 'xCircle',
};

/**
 * Message encadré : une icône et une teinte par nature de message, pour ne pas
 * reposer sur la couleur seule. `role` : `alert` pour une erreur à annoncer
 * aussitôt, `status` pour une information.
 */
export function Notice({
  tone = 'info',
  role,
  children,
}: {
  tone?: NoticeTone;
  role?: 'alert' | 'status';
  children: ReactNode;
}) {
  return (
    <div className={`${tone === 'error' ? 'error' : `notice ${tone}`} with-icon`} role={role}>
      <Icon name={ICONS[tone]} />
      <div className="notice-content">{children}</div>
    </div>
  );
}
