import { type ApiError, ErrorCode, isApiError } from '@strategos/shared';

/** Erreur levée par `apiFetch` : `code` est une clé `errors.<CODE>` du fichier de traduction. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly error:
      ApiError | { code: 'NETWORK'; message: string; details: Record<string, unknown> },
  ) {
    super(error.message);
  }

  get code(): string {
    return this.error.code;
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let csrfToken: Promise<string> | null = null;

/** Jeton CSRF en cache ; à oublier quand la session change (connexion, déconnexion). */
export function resetCsrfToken(): void {
  csrfToken = null;
}

function getCsrfToken(): Promise<string> {
  csrfToken ??= request<{ csrfToken: string }>('GET', '/auth/csrf').then((r) => r.csrfToken);
  csrfToken.catch(resetCsrfToken);
  return csrfToken;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (MUTATING.has(method)) headers['X-CSRF-Token'] = await getCsrfToken();

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, { code: 'NETWORK', message: 'Network error', details: {} });
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isApiError(payload)) throw new ApiRequestError(response.status, payload);
    throw new ApiRequestError(response.status, {
      code: ErrorCode.INTERNAL_ERROR,
      message: response.statusText,
      details: {},
    });
  }
  return payload as T;
}

/**
 * Appel JSON vers le backend. Les requêtes qui modifient des données portent le
 * jeton CSRF ; s'il a expiré, un nouveau jeton est demandé et l'appel rejoué une fois.
 */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? 'GET';
  try {
    return await request<T>(method, path, init.body);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === ErrorCode.CSRF_INVALID) {
      resetCsrfToken();
      return request<T>(method, path, init.body);
    }
    throw error;
  }
}
