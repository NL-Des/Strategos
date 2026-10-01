const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const TIME = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' });

/** « 01/10/2026 » */
export const formatDate = (iso: string | Date): string => DATE.format(new Date(iso));

/** « 01/10/2026 12:23 » : sans les secondes, inutiles à la lecture. */
export const formatDateTime = (iso: string | Date): string => DATE_TIME.format(new Date(iso));

/** L'heure seule pour un message du jour, la date et l'heure sinon. */
export function formatMessageTime(iso: string | Date): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? TIME.format(date) : DATE_TIME.format(date);
}
