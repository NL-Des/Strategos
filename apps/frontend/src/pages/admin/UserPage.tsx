import { PASSWORD_MIN_LENGTH, type UserDetail } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  deleteUser,
  disableUser,
  enableUser,
  getUser,
  renameUser,
  resetPassword,
} from '../../api/users';
import { ErrorMessage } from '../../components/ErrorMessage';

/** Fiche d'un compte : pseudo, réinitialisation, désactivation, suppression. */
export function UserPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const user = useQuery({ queryKey: ['admin', 'users', id], queryFn: () => getUser(id) });

  return (
    <section>
      <Link to="/admin/users">{t('admin.users.back')}</Link>
      <ErrorMessage error={user.error} />
      {user.data && <UserDetails key={user.data.id} user={user.data} />}
    </section>
  );
}

function UserDetails({ user }: { user: UserDetail }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState(user.username);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const onUpdated = (updated: UserDetail, message: string) => {
    queryClient.setQueryData(['admin', 'users', user.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'], exact: false });
    setNotice(message);
  };

  const rename = useMutation({
    mutationFn: () => renameUser(user.id, { username, version: user.version }),
    onSuccess: (u) => onUpdated(u, t('admin.user.renamed')),
  });
  const reset = useMutation({
    mutationFn: () => resetPassword(user.id, temporaryPassword),
    onSuccess: (u) => onUpdated(u, t('admin.user.passwordReset')),
  });
  const toggle = useMutation({
    mutationFn: () => (user.status === 'active' ? disableUser(user.id) : enableUser(user.id)),
    onSuccess: (u) =>
      onUpdated(u, t(u.status === 'active' ? 'admin.user.enabled' : 'admin.user.disabled')),
  });
  const remove = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void navigate('/admin/users', { replace: true });
    },
  });
  const error = rename.error ?? reset.error ?? toggle.error ?? remove.error;

  return (
    <>
      <h1>{user.username}</h1>
      <p>
        {t(`admin.users.status_${user.status}`)}
        {user.mustChangeCredentials && ` · ${t('admin.users.temporaryPassword')}`}
      </p>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <ErrorMessage error={error} />

      <form
        className="card form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          rename.mutate();
        }}
      >
        <h2>{t('admin.user.rename')}</h2>
        <label>
          {t('fields.username')}
          <input required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <button type="submit" disabled={rename.isPending || username === user.username}>
          {t('common.save')}
        </button>
      </form>

      {!user.isAdmin && (
        <>
          <form
            className="card form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              reset.mutate();
            }}
          >
            <h2>{t('admin.user.resetPassword')}</h2>
            <label>
              {t('fields.temporaryPassword')}
              <input
                required
                autoComplete="off"
                minLength={PASSWORD_MIN_LENGTH}
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
              />
              <small>{t('hints.temporaryPassword', { min: PASSWORD_MIN_LENGTH })}</small>
            </label>
            <button type="submit" disabled={reset.isPending}>
              {t('admin.user.resetSubmit')}
            </button>
          </form>

          <div className="card actions">
            <button type="button" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              {t(user.status === 'active' ? 'admin.user.disable' : 'admin.user.enable')}
            </button>
            <button
              type="button"
              className="danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('admin.user.deleteConfirm', { username: user.username }))) {
                  remove.mutate();
                }
              }}
            >
              {t('admin.user.delete')}
            </button>
          </div>
        </>
      )}
      {user.isAdmin && <p className="muted">{t('admin.user.adminProtected')}</p>}
    </>
  );
}
