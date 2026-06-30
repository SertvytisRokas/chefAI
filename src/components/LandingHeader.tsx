"use client";

import Link from 'next/link';
import { useUser } from './SupabaseProvider';

/**
 * Marketing header for the landing page. Logo on the left,
 * login / register on the right (or app link when signed in).
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
          <Link href="/fridge" className="btn btn-landing-primary">
            Open app
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn btn-landing-ghost">
              Log in
            </Link>
            <Link href="/login?mode=signup" className="btn btn-landing-primary">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
