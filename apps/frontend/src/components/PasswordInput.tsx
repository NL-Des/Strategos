import { type InputHTMLAttributes, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Champ de mot de passe avec un bouton pour afficher la saisie (utile sur mobile). */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className="password-input">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="secondary"
        aria-label={t(shown ? 'login.hidePassword' : 'login.showPassword')}
        aria-pressed={shown}
        onClick={() => setShown(!shown)}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} />
      </button>
    </div>
  );
}
