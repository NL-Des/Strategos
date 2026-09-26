import { PASSWORD_MIN_LENGTH, type UserDetail } from '@strategos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { listGroups } from '../../api/groups';
import { listPages } from '../../api/pages';
import {
  deleteUser,
  disableUser,
  enableUser,
  getUser,
  replaceUserGroups,
  resetPassword,
  updateUser,
} from '../../api/users';
import { ErrorMessage } from '../../components/ErrorMessage';
import { RightsTable } from '../../components/RightsTable';

/**
 * Fiche d'un compte : pseudo et page personnelle, groupes, droits effectifs,
 * réinitialisation, désactivation, suppression.
 */
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
  const [personalPageId, setPersonalPageId] = useState(user.personalPageId ?? '');
  const [groupIds, setGroupIds] = useState(() => new Set(user.groups.map((g) => g.id)));
  const pages = useQuery({ queryKey: ['admin', 'pages'], queryFn: listPages });
  const groups = useQuery({ queryKey: ['admin', 'groups'], queryFn: listGroups });
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const onUpdated = (updated: UserDetail, message: string) => {
    queryClient.setQueryData(['admin', 'users', user.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'], exact: false });
    setNotice(message);
  };

  const saveIdentity = useMutation({
    mutationFn: () =>
      updateUser(user.id, {
        username,
        personalPageId: personalPageId || null,
        version: user.version,
      }),
    onSuccess: (u) => onUpdated(u, t('admin.user.saved')),
  });
  const saveGroups = useMutation({
    mutationFn: () => replaceUserGroups(user.id, [...groupIds]),
    onSuccess: (u) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'group'] });
      onUpdated(u, t('admin.user.groupsSaved'));
    },
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
  const error =
    saveIdentity.error ?? saveGroups.error ?? reset.error ?? toggle.error ?? remove.error;
  const unchanged = username === user.username && personalPageId === (user.personalPageId ?? '');

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
          saveIdentity.mutate();
        }}
      >
        <h2>{t('admin.user.identity')}</h2>
        <label>
          {t('fields.username')}
          <input required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          {t('fields.personalPageId')}
          <select value={personalPageId} onChange={(e) => setPersonalPageId(e.target.value)}>
            <option value="">{t('admin.user.noPersonalPage')}</option>
            {pages.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.publishedAt ? '' : ` (${t('builder.pages.neverPublished')})`}
              </option>
            ))}
          </select>
          <small>{t('admin.user.personalPageHint')}</small>
        </label>
        <button type="submit" disabled={saveIdentity.isPending || unchanged}>
          {t('common.save')}
        </button>
      </form>

      {!user.isAdmin && (
        <div className="card form">
          <h2>{t('admin.user.groups')}</h2>
          <div className="check-list">
            {groups.data?.map((g) => (
              <label key={g.id} className="inline">
                <input
                  type="checkbox"
                  checked={groupIds.has(g.id)}
                  onChange={(e) => {
                    const next = new Set(groupIds);
                    if (e.target.checked) next.add(g.id);
                    else next.delete(g.id);
                    setGroupIds(next);
                  }}
                />
                <Link to={`/admin/groups/${g.id}`}>{g.name}</Link>
              </label>
            ))}
          </div>
          {groups.data?.length === 0 && <p className="muted">{t('admin.groups.empty')}</p>}
          <button type="button" disabled={saveGroups.isPending} onClick={() => saveGroups.mutate()}>
            {t('admin.user.saveGroups')}
          </button>
        </div>
      )}

      <div className="card">
        <h2>{t('rights.effective')}</h2>
        {user.isAdmin ? (
          <p className="muted">{t('rights.adminHasAll')}</p>
        ) : (
          <RightsTable rights={user.rights} linkTo={(r) => `/admin/rights/${r.type}/${r.id}`} />
        )}
      </div>

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
