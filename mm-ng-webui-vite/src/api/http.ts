import type { ApiEnvelope } from '../types/minemeld';

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(response: Response, message?: string) {
    super(message || response.statusText || `API request failed with ${response.status}`);
    this.name = 'ApiError';
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

function isJsonResponse(response: Response) {
  return response.headers.get('content-type')?.includes('application/json');
}

function normalizeErrorPayload(payload: ApiEnvelope<unknown> | undefined) {
  const error = payload?.error;

  if (!error) {
    return undefined;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return undefined;
}

function cookieValue(name: string) {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message || `${error.status} ${error.statusText}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Request failed';
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('If-Modified-Since', 'Mon, 26 Jul 1997 05:00:00 GMT');
  headers.set('Cache-Control', 'no-cache');
  headers.set('Pragma', 'no-cache');
  const csrfToken = cookieValue('XSRF-TOKEN');
  if (csrfToken && !headers.has('X-XSRF-TOKEN')) {
    headers.set('X-XSRF-TOKEN', decodeURIComponent(csrfToken));
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let message: string | undefined;
    if (isJsonResponse(response)) {
      const body = (await response.json().catch(() => undefined)) as ApiEnvelope<unknown> | undefined;
      message = normalizeErrorPayload(body);
    } else {
      message = await response.text().catch(() => undefined);
    }
    throw new ApiError(response, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (isJsonResponse(response)) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export function unwrapResult<T>(envelope: ApiEnvelope<T> | T): T {
  if (envelope && typeof envelope === 'object' && 'result' in envelope) {
    return (envelope as ApiEnvelope<T>).result as T;
  }

  return envelope as T;
}

export function addQuery(path: string, params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}
