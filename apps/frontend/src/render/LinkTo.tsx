import type { ResolvedLink } from '@strategos/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Lien déjà résolu par le backend : page interne ou adresse externe (nouvel onglet). */
export function LinkTo({
  link,
  className,
  children,
}: {
  link: ResolvedLink;
  className?: string;
  children: ReactNode;
}) {
  if (link.kind === 'page') {
    return (
      <Link to={`/pages/${link.pageId}`} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
