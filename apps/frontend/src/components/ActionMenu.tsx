import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Rouage qui ouvre une liste d'actions (messages, sujets). Les enfants sont des
 * `<button className="menu-item" role="menuitem">` ; tout clic referme le menu.
 */
export function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="action-menu" ref={ref}>
      <button
        type="button"
        className="link action-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {open && (
        <div className="action-menu-dropdown" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
