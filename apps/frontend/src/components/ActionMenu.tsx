import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { useMenu } from './useMenu';

/**
 * Rouage qui ouvre une liste d'actions (messages, sujets). Les enfants sont des
 * `<button className="menu-item" role="menuitem">` ; tout clic referme le menu.
 */
export function ActionMenu({
  label,
  icon = 'settings',
  children,
}: {
  label: string;
  icon?: IconName;
  children: ReactNode;
}) {
  const { open, setOpen, placement, rootRef, buttonRef, menuRef, onKeyDown } = useMenu();
  return (
    <div className="action-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="link action-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`action-menu-dropdown ${placement}`.trim()}
          role="menu"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
