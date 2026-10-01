import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@strategos/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { changePassword, getProfile } from '../api/profile';
import { useMe } from '../auth/useMe';
import { ErrorMessage } from '../components/ErrorMessage';
import { Loading } from '../components/Loading';
import { Notice } from '../components/Notice';
import { formatDate } from '../format';
import { useDocumentTitle } from '../useDocumentTitle';
import { RightsTable } from '../components/RightsTable';

/**
 * Profil (05) : page administrative en lecture seule, sauf le mot de passe.
 * Hors page builder ; accessible par le menu de compte.
 */
export function ProfilePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const profile = useQuery({ queryKey: ['me', 'profile'], queryFn: getProfile });
  useDocumentTitle(t('profile.title'));

  return (
    <section>
      <h1>{t('profile.title')}</h1>
      <ErrorMessage error={profile.error} />
      {profile.isPending && <Loading />}
      {profile.data && (
        <>
          <div className="card">
            <dl className="facts">
              <dt>{t('fields.username')}</dt>
              <dd>{profile.data.username}</dd>
              <dt>{t('profile.createdAt')}</dt>
              <dd>{formatDate(profile.data.createdAt)}</dd>
              <dt>{t('admin.users.status')}</dt>
              <dd>{t(`admin.users.status_${profile.data.status}`)}</dd>
              <dt>{t('profile.groups')}</dt>
              <dd>
                {profile.data.rights.groups.map((g) => g.name).join(', ') || t('profile.noGroup')}
              </dd>
            </dl>
            <Link to="/submissions">{t('account.submissions')}</Link>
          </div>
          <div className="card">
            <h2>{t('rights.effective')}</h2>
            {me?.isAdmin ? (
              <p className="muted">{t('rights.adminHasAll')}</p>
            ) : (
              <RightsTable rights={profile.data.rights} linkTo={(r) => `/pages/${r.id}`} />
            )}
          </div>
        </>
      )}
      <PasswordForm />
    </section>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState(false);
  const mismatch = confirmation !== '' && confirmation !== newPassword;
  const mutation = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setDone(true);
    },
  });

  return (
    <form
      className="card form compact"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setDone(false);
        if (!mismatch) mutation.mutate();
      }}
    >
      <h2>{t('profile.changePassword')}</h2>
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
      {done && (
        <Notice tone="success" role="status">
          {t('profile.passwordChanged')}
        </Notice>
      )}
      <ErrorMessage error={mutation.error} />
      <button type="submit" disabled={mutation.isPending || mismatch}>
        {t('profile.changePasswordSubmit')}
      </button>
    </form>
  );
}
