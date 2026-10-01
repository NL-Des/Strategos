import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Comportement commun des menus déroulants (compte, actions) : fermeture au
 * clic extérieur et sur Échap, flèches entre les entrées, focus rendu au
 * bouton, et ouverture vers le haut ou la gauche quand la place manque.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []).filter(
      (item) => !item.hasAttribute('disabled'),
    );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return setPlacement('');
    const box = menu.getBoundingClientRect();
    // Dans une liste défilante (chat), le menu ne doit pas dépasser son cadre.
    const frame = menu.closest('.chat-messages')?.getBoundingClientRect();
    const bottom = Math.min(window.innerHeight, frame?.bottom ?? Infinity);
    setPlacement(`${box.bottom > bottom ? 'up' : ''} ${box.left < 0 ? 'start' : ''}`.trim());
    items()[0]?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      return close();
    }
    const list = items();
    const current = list.indexOf(document.activeElement as HTMLElement);
    const target =
      event.key === 'ArrowDown'
        ? list[(current + 1) % list.length]
        : event.key === 'ArrowUp'
          ? list[(current - 1 + list.length) % list.length]
          : event.key === 'Home'
            ? list[0]
            : event.key === 'End'
              ? list[list.length - 1]
              : undefined;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };

  return { open, setOpen, close, placement, rootRef, buttonRef, menuRef, onKeyDown };
}
