"use client";

import Link from 'next/link';
import { useUser } from './SupabaseProvider';
import UserMenu from './UserMenu';

/**
 * Site header — logo left; log in / sign up or avatar menu right.
 */
export default function LandingHeader() {
  const user = useUser();

  return (
    <header className="landing-header">
      <Link href="/" className="landing-logo">
        chef<span className="landing-logo-accent">AI</span>
      </Link>
      <nav className="landing-nav">
        {user ? (
          <UserMenu />
        ) : (
          <>
            <Link href="/login" className="btn btn-landing-ghost">
              Log in
            </Link>
            <Link href="/login?mode=signup" className="btn btn-landing-primary">
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
