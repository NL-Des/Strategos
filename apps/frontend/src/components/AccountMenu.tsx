import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { logout } from '../api/auth';
import { ME_KEY, useMe } from '../auth/useMe';
import { useMenu } from './useMenu';

/**
 * Menu de compte (06) : seul élément que l'admin ne construit pas, fixe dans un
 * coin sur toutes les pages : Profil, Notes, Mes soumissions et Déconnexion.
 */
export function AccountMenu() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const { open, setOpen, placement, rootRef, buttonRef, menuRef, onKeyDown } = useMenu();
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

  if (!me) return null;
  return (
    <div className="account-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
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
        <div ref={menuRef} className={`account-dropdown ${placement}`.trim()} role="menu">
          <p className="account-name">{me.username}</p>
          {!me.mustChangeCredentials && (
            <Link role="menuitem" to="/profile" onClick={() => setOpen(false)}>
              {t('account.profile')}
            </Link>
          )}
          {!me.mustChangeCredentials && (
            <Link role="menuitem" to="/notes" onClick={() => setOpen(false)}>
              {t('account.notes')}
            </Link>
          )}
          {!me.mustChangeCredentials && (
            <Link role="menuitem" to="/submissions" onClick={() => setOpen(false)}>
              {t('account.submissions')}
            </Link>
          )}
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
