const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Filtre de liste côté navigateur : sans casse ni accents (« equipe » trouve « Équipe »). */
export const matches = (text: string, query: string): boolean =>
  normalize(text).includes(normalize(query.trim()));
