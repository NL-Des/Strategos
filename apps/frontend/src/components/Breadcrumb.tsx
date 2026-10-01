import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Icon } from './Icon';

/** Fil d'Ariane d'un écran de détail : les écrans parents, au-dessus du titre. */
export function Breadcrumb({ items }: { items: { label: string; to: string }[] }) {
  const { t } = useTranslation();
  return (
    <nav className="breadcrumb" aria-label={t('common.breadcrumb')}>
      {items.map((item) => (
        <Fragment key={item.to}>
          <Link to={item.to}>{item.label}</Link>
          <Icon name="chevronRight" size={14} />
        </Fragment>
      ))}
    </nav>
  );
}
