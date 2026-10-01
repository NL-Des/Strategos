import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * Formulaire de création replié derrière un bouton : la liste, qui est le
 * contenu principal de l'écran, reste en premier.
 */
export function CreatePanel({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="create-panel">
      <button
        type="button"
        className={open ? 'secondary' : undefined}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={open ? 'x' : 'plus'} />
        {open ? t('common.close') : label}
      </button>
      {open && children}
    </div>
  );
}
