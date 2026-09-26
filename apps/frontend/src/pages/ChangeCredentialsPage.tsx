import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@strategos/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { changeCredentials } from '../api/auth';
import { ME_KEY, useMe } from '../auth/useMe';
import { ErrorMessage } from '../components/ErrorMessage';

/** Changement d'identifiants forcé ; seul l'admin peut aussi changer de pseudo. */
export function ChangeCredentialsPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [newUsername, setNewUsername] = useState(me?.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const mismatch = confirmation !== '' && confirmation !== newPassword;

  const mutation = useMutation({
    mutationFn: () =>
      changeCredentials({
        currentPassword,
        newPassword,
        ...(me?.isAdmin && newUsername !== me.username ? { newUsername } : {}),
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user);
      void navigate('/', { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mismatch) mutation.mutate();
  };

  return (
    <form className="card form narrow" onSubmit={submit}>
      <h1>{t('changeCredentials.title')}</h1>
      <p>{t(me?.isAdmin ? 'changeCredentials.introAdmin' : 'changeCredentials.intro')}</p>
      {me?.isAdmin && (
        <label>
          {t('fields.newUsername')}
          <input
            autoComplete="username"
            required
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
        </label>
      )}
      <label>
        {t('fields.currentPassword')}
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>
      <label>
        {t('fields.newPassword')}
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <small>{t('hints.password', { min: PASSWORD_MIN_LENGTH })}</small>
      </label>
      <label>
        {t('fields.confirmation')}
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {mismatch && <small className="error-text">{t('changeCredentials.mismatch')}</small>}
      </label>
      <ErrorMessage error={mutation.error} />
      <button type="submit" disabled={mutation.isPending || mismatch}>
        {t('common.save')}
      </button>
    </form>
  );
}
