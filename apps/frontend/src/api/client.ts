import { type ApiError, isApiError } from '@strategos/shared';

/** Erreur levée par `apiFetch` : `code` est une clé `errors.<CODE>` du fichier de traduction. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError | { code: 'NETWORK'; message: string; details: object },
  ) {
    super(error.message);
  }

  get code(): string {
    return this.error.code;
  }
}

/** Appel JSON vers le backend ; toute erreur devient une `ApiRequestError`. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(0, { code: 'NETWORK', message: 'Network error', details: {} });
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isApiError(body)) throw new ApiRequestError(response.status, body);
    throw new ApiRequestError(response.status, {
      code: 'INTERNAL_ERROR',
      message: response.statusText,
      details: {},
    });
  }
  return body as T;
}
