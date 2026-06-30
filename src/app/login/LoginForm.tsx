"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabase/client';

type SignupStep = 'email' | 'password';

type PasswordChecks = {
  length: boolean;
  letter: boolean;
  numberOrSpecial: boolean;
};

function checkPassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= 10,
    letter: /[a-zA-Z]/.test(pw),
    numberOrSpecial: /[0-9#?!&@$%^*()_+\-=[\]{};':"\\|,.<>/~`]/.test(pw),
  };
}

function allChecksPass(checks: PasswordChecks): boolean {
  return checks.length && checks.letter && checks.numberOrSpecial;
}

function AuthBrand() {
  return (
    <Link href="/" className="auth-brand">
      chef<span className="landing-logo-accent">AI</span>
    </Link>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  if (off) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 3l18 18M10.58 10.58a2 2 0 002.84 2.84M9.88 5.09A10.94 10.94 0 0112 5c5 0 9.27 3.11 11 7a11.8 11.8 0 01-4.12 4.73M6.09 6.09A11.65 11.65 0 003 12c1.73 3.89 6 7 11 7 1.75 0 3.4-.37 4.88-1.03"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

/**
 * Log in and sign up — Spotify-inspired minimal flow.
 * Sign up: email → password with live requirement checks.
 */
export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/fridge';
  const initialMode =
    searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [signupStep, setSignupStep] = useState<SignupStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordChecks = checkPassword(password);
  const passwordValid = allChecksPass(passwordChecks);

  function switchMode(next: 'login' | 'signup') {
    setMode(next);
    setSignupStep('email');
    setPassword('');
    setShowPassword(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = supabaseBrowser();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      if (data.session) router.replace(redirectPath);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      alert(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordValid) return;
    setLoading(true);
    const supabase = supabaseBrowser();
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        router.replace('/profile');
      } else {
        alert('Check your email for a confirmation link.');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      alert(message);
    } finally {
      setLoading(false);
    }
  }

  function handleSignupEmailNext(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSignupStep('password');
    setPassword('');
    setShowPassword(false);
  }

  if (mode === 'login') {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <AuthBrand />
          <h1 className="auth-title">Log in to chefAI</h1>
          <form onSubmit={handleLogin} className="auth-fields">
            <label className="auth-label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              className="auth-input"
              placeholder="name@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <label className="auth-label" htmlFor="login-password">
              Password
            </label>
            <div className="auth-password-wrap">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-input auth-input--password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-pill btn-pill-primary"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>
          <p className="auth-switch">
            Don&apos;t have an account?{' '}
            <button type="button" className="auth-link" onClick={() => switchMode('signup')}>
              Sign up
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (signupStep === 'email') {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <AuthBrand />
          <h1 className="auth-title">Sign up to start cooking</h1>
          <form onSubmit={handleSignupEmailNext} className="auth-fields">
            <label className="auth-label" htmlFor="signup-email">
              Email address
            </label>
            <input
              id="signup-email"
              type="email"
              className="auth-input"
              placeholder="name@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <button type="submit" className="btn btn-pill btn-pill-primary">
              Next
            </button>
          </form>
          <p className="auth-switch">
            Already have an account?{' '}
            <button type="button" className="auth-link" onClick={() => switchMode('login')}>
              Log in
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-form">
        <AuthBrand />
        <button
          type="button"
          className="auth-back"
          onClick={() => {
            setSignupStep('email');
            setPassword('');
          }}
        >
          ← Back
        </button>
        <h1 className="auth-title">Create a password</h1>
        <form onSubmit={handleSignup} className="auth-fields">
          <label className="auth-label" htmlFor="signup-password">
            Password
          </label>
          <div className="auth-password-wrap">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              className="auth-input auth-input--password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>
          <p className="auth-reqs-heading">Your password must contain at least</p>
          <ul className="auth-reqs">
            <li className={passwordChecks.letter ? 'met' : ''}>
              <span className="auth-req-mark" aria-hidden="true">
                {passwordChecks.letter ? '✓' : '○'}
              </span>
              1 letter
            </li>
            <li className={passwordChecks.numberOrSpecial ? 'met' : ''}>
              <span className="auth-req-mark" aria-hidden="true">
                {passwordChecks.numberOrSpecial ? '✓' : '○'}
              </span>
              1 number or special character (example: # ? ! &amp;)
            </li>
            <li className={passwordChecks.length ? 'met' : ''}>
              <span className="auth-req-mark" aria-hidden="true">
                {passwordChecks.length ? '✓' : '○'}
              </span>
              10 characters
            </li>
          </ul>
          <button
            type="submit"
            disabled={loading || !passwordValid}
            className="btn btn-pill btn-pill-primary"
          >
            {loading ? 'Signing up…' : 'Sign up'}
          </button>
        </form>
      </div>
    </div>
  );
}
