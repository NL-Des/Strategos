import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { logout } from '../api/auth';
import { ME_KEY, useMe } from '../auth/useMe';

/** Cadre des écrans connectés, avec un menu de compte provisoire (fixé à l'étape 3). */
export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
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

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          {t('app.name')}
        </Link>
        {me && (
          <nav className="account-menu" aria-label={t('account.menu')}>
            <span>{me.username}</span>
            {me.isAdmin && !me.mustChangeCredentials && (
              <Link to="/admin/users">{t('admin.title')}</Link>
            )}
            <button type="button" className="link" onClick={() => logoutMutation.mutate()}>
              {t('account.logout')}
            </button>
          </nav>
        )}
      </header>
      <main className="page">{children}</main>
    </>
  );
}
