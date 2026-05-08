import type { CurrentUser } from '../types/minemeld';

export function displayUsername(user: CurrentUser | null | undefined, fallback = 'Local user') {
  const raw = user?.username || user?.id || fallback;
  return raw.replace(/^(admin|oidc|feeds)\//, '');
}
