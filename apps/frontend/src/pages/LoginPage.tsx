import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { login } from '../api/auth';
import { ME_KEY, useMe } from '../auth/useMe';
import { ErrorMessage } from '../components/ErrorMessage';
import { PasswordInput } from '../components/PasswordInput';
import { useDocumentTitle } from '../useDocumentTitle';

export function LoginPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  useDocumentTitle(t('login.title'));
  const mutation = useMutation({
    mutationFn: () => login(username, password),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
      void navigate(user.mustChangeCredentials ? '/change-credentials' : '/', { replace: true });
    },
  });

  if (me && !mutation.isPending) return <Navigate to="/" replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <main className="auth-screen">
      <h1>{t('app.name')}</h1>
      <form className="card form" onSubmit={submit}>
        <h2>{t('login.title')}</h2>
        <label>
          {t('fields.username')}
          <input
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <div className="form-field">
          <label htmlFor="login-password">{t('fields.password')}</label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorMessage error={mutation.error} />
        <button type="submit" disabled={mutation.isPending}>
          {/* Le libellé reste le même pendant l'envoi : seul l'indicateur s'ajoute. */}
          {mutation.isPending && <span className="spinner" aria-hidden="true" />}
          {t('login.submit')}
        </button>
      </form>
    </main>
  );
}
