import argon2 from 'argon2';

/** Hachage argon2id : à sens unique, le mot de passe n'est jamais stocké ni renvoyé. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

let dummyHash: Promise<string> | undefined;

/**
 * Vérifie un mot de passe. Sans hash (compte inexistant), vérifie contre un hash
 * factice pour que la durée de réponse ne révèle pas l'existence du compte.
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  dummyHash ??= hashPassword('mot de passe factice');
  const ok = await argon2.verify(hash ?? (await dummyHash), password).catch(() => false);
  return hash !== null && ok;
}
