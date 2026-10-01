import { randomBytes } from 'node:crypto';

/** Durée de validité d'un `state` : le temps de se connecter chez le fournisseur. */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * `state` d'une connexion OAuth (08) : aléatoire, à usage unique, lié à l'admin
 * qui a lancé la connexion. Il remplace le CSRF au retour du fournisseur, qui
 * arrive sans cookie de session.
 */
export class OAuthStates {
  private readonly states = new Map<string, { userId: string; expiresAt: number }>();

  create(userId: string): string {
    const now = Date.now();
    for (const [state, entry] of this.states) if (entry.expiresAt <= now) this.states.delete(state);
    const state = randomBytes(24).toString('base64url');
    this.states.set(state, { userId, expiresAt: now + STATE_TTL_MS });
    return state;
  }

  /** Admin lié au `state` ; `null` s'il est inconnu, expiré ou déjà utilisé. */
  consume(state: string | undefined): string | null {
    const entry = state ? this.states.get(state) : undefined;
    if (state) this.states.delete(state);
    return entry && entry.expiresAt > Date.now() ? entry.userId : null;
  }
}
