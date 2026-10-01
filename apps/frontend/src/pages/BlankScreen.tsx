import type { ReactNode } from 'react';
import { AccountMenu } from '../components/AccountMenu';
import { Icon, type IconName } from '../components/Icon';

/**
 * Écran neutre hors page construite (page introuvable, aucun espace attribué) :
 * un titre, une explication et une issue, avec le menu de compte.
 */
export function BlankScreen({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="blank-screen">
      <AccountMenu />
      <Icon name={icon} size={40} />
      <h1>{title}</h1>
      {children}
    </main>
  );
}
