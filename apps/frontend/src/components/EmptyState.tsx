import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Liste vide : dit ce qui manque et, si possible, propose l'action qui la remplit. */
export function EmptyState({
  icon = 'inbox',
  children,
  action,
}: {
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={28} />
      <p>{children}</p>
      {action}
    </div>
  );
}
