"use client";

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  authModeFromSearch,
  buildLoginHref,
  navigateAuth,
  type AuthMode,
} from '../lib/authNav';

/**
 * Header log in / sign up links — work on /login even when the URL unchanged.
 */
export default function AuthHeaderNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMode = authModeFromSearch(searchParams);

  function handleClick(mode: AuthMode, e: React.MouseEvent<HTMLAnchorElement>) {
    if (pathname !== '/login') return;
    e.preventDefault();
    if (currentMode === mode) {
      navigateAuth(mode);
      return;
    }
    router.replace(buildLoginHref(mode, searchParams));
  }

  return (
    <>
      <Link
        href={buildLoginHref('login', searchParams)}
        className="btn btn-landing-ghost"
        onClick={(e) => handleClick('login', e)}
      >
        Log in
      </Link>
      <Link
        href={buildLoginHref('signup', searchParams)}
        className="btn btn-landing-primary"
        onClick={(e) => handleClick('signup', e)}
      >
        Sign up
      </Link>
    </>
  );
}
