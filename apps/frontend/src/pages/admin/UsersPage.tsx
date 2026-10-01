import { PASSWORD_MIN_LENGTH, type UserStatus } from '@strategos/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { createUser, listUsers } from '../../api/users';
import { ErrorMessage } from '../../components/ErrorMessage';
import { CreatePanel } from '../../components/CreatePanel';
import { EmptyState } from '../../components/EmptyState';
import { Pagination } from '../../components/Pagination';

/** Admin › Comptes : liste filtrable et création avec mot de passe temporaire. */
export function UsersPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const users = useQuery({
    queryKey: ['admin', 'users', { page, q, status }],
    queryFn: () => listUsers({ page, q: q.trim() || undefined, status: status || undefined }),
    placeholderData: keepPreviousData,
  });

  return (
    <section>
      <h1>{t('admin.users.title')}</h1>
      <CreatePanel label={t('admin.users.create')}>
        <CreateUserForm />
      </CreatePanel>

      <div className="filters">
        <input
          type="search"
          placeholder={t('admin.users.search')}
          aria-label={t('admin.users.search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label={t('admin.users.status')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as UserStatus | '');
            setPage(1);
          }}
        >
          <option value="">{t('admin.users.allStatuses')}</option>
          <option value="active">{t('admin.users.status_active')}</option>
          <option value="disabled">{t('admin.users.status_disabled')}</option>
        </select>
      </div>

      <ErrorMessage error={users.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('fields.username')}</th>
              <th>{t('admin.users.status')}</th>
              <th>{t('admin.users.createdAt')}</th>
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link to={`/admin/users/${user.id}`}>{user.username}</Link>
                  {user.isAdmin && <span className="badge">{t('admin.users.admin')}</span>}
                  {user.mustChangeCredentials && (
                    <span className="badge muted">{t('admin.users.temporaryPassword')}</span>
                  )}
                </td>
                <td>
                  <span
                    className={`status ${user.status === 'active' ? 'status-validated' : 'status-none'}`}
                  >
                    {t(`admin.users.status_${user.status}`)}
                  </span>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString('fr-FR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.data && (
        <Pagination
          page={page}
          total={users.data.total}
          pageSize={users.data.pageSize}
          onChange={setPage}
        />
      )}
      {users.data?.total === 0 && <EmptyState icon="user">{t('admin.users.empty')}</EmptyState>}
    </section>
  );
}

function CreateUserForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const mutation = useMutation({
    mutationFn: () => createUser({ username, temporaryPassword }),
    onSuccess: (user) => void navigate(`/admin/users/${user.id}`),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{t('admin.users.create')}</h2>
      <label>
        {t('fields.username')}
        <input required value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
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
      <ErrorMessage error={mutation.error} />
      <button type="submit" disabled={mutation.isPending}>
        {t('admin.users.createSubmit')}
      </button>
    </form>
  );
}
