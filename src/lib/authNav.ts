export type AuthMode = 'login' | 'signup';

type SearchParamsLike = { get(key: string): string | null };

export function buildLoginHref(
  mode: AuthMode,
  searchParams?: SearchParamsLike
): string {
  const params = new URLSearchParams();
  if (mode === 'signup') params.set('mode', 'signup');
  const redirect = searchParams?.get('redirect');
  if (redirect) params.set('redirect', redirect);
  const qs = params.toString();
  return qs ? `/login?${qs}` : '/login';
}

export function authModeFromSearch(
  searchParams: SearchParamsLike
): AuthMode {
  return searchParams.get('mode') === 'signup' ? 'signup' : 'login';
}

type AuthNavListener = (mode: AuthMode) => void;

let listener: AuthNavListener | null = null;

export function setAuthNavListener(fn: AuthNavListener | null) {
  listener = fn;
}

/** Reset or switch the login form when already on /login. */
export function navigateAuth(mode: AuthMode) {
  listener?.(mode);
}
