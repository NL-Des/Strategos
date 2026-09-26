import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './fr.json';

/** Tous les textes de l'interface passent par ces fichiers de traduction (11 — Langue). */
export const resources = { fr: { translation: fr } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export default i18n;
