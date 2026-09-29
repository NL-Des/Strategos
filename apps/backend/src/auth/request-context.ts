import type { User } from '../generated/prisma/client.js';

/** Session résolue depuis le cookie, attachée à la requête par `SessionGuard`. */
export interface AuthContext {
  sessionId: string;
  csrfSecret: string;
  user: User;
  /** La session vient d'être prolongée : le cookie doit l'être aussi. */
  renewed?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
