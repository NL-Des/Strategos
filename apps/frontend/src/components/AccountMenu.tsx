import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { logout } from '../api/auth';
import { ME_KEY, useMe } from '../auth/useMe';

/**
 * Menu de compte (06) : seul élément que l'admin ne construit pas, fixe dans un
 * coin sur toutes les pages. Profil, notes et soumissions s'y ajoutent à leurs étapes.
 */
export function AccountMenu() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
      void navigate('/login', { replace: true });
    },
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!me) return null;
  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account.menu')}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{me.username.slice(0, 1).toUpperCase()}</span>
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <p className="account-name">{me.username}</p>
          {me.isAdmin && !me.mustChangeCredentials && (
            <Link role="menuitem" to="/admin/pages" onClick={() => setOpen(false)}>
              {t('admin.title')}
            </Link>
          )}
          <button type="button" role="menuitem" onClick={() => logoutMutation.mutate()}>
            {t('account.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
