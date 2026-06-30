"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabase/client';
import {
  authModeFromSearch,
  buildLoginHref,
  setAuthNavListener,
  type AuthMode,
} from '../../lib/authNav';
import { getSiteUrl } from '../../lib/siteUrl';

type SignupStep = 'email' | 'password' | 'verify';

type PasswordChecks = {
  length: boolean;
  letter: boolean;
  number: boolean;
  special: boolean;
};

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;
const SPECIAL_CHAR_RE = /[#?!&@$%^*()_+\-=[\]{};':"\\|,.<>/~`]/;

function checkPassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= 10,
    letter: /[a-zA-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: SPECIAL_CHAR_RE.test(pw),
  };
}

function allChecksPass(checks: PasswordChecks): boolean {
  return checks.length && checks.letter && checks.number && checks.special;
}

function slideIndex(mode: 'login' | 'signup', signupStep: SignupStep): number {
  if (mode === 'login') return 0;
  if (signupStep === 'email') return 1;
  if (signupStep === 'password') return 2;
  return 3;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function sanitizeOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

function authErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

function isDuplicateSignup(
  data: { user: { identities?: unknown[] } | null },
  error: { message?: string; code?: string } | null
): boolean {
  if (data.user && (data.user.identities?.length ?? 0) === 0) return true;
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    msg.includes('already registered') ||
    msg.includes('already exists') ||
    error.code === 'user_already_exists' ||
    error.code === 'email_exists'
  );
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

function AuthError({
  message,
  suggestLogin,
  onLogin,
}: {
  message: string | null;
  suggestLogin?: boolean;
  onLogin?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="auth-error-block" role="alert">
      <p className="auth-error">{message}</p>
      {suggestLogin && onLogin && (
        <p className="auth-error-action">
          <button type="button" className="auth-link" onClick={onLogin}>
            Log in instead
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * Log in and sign up — minimal multi-step flow with sliding panels.
 * Sign up: email → password → email confirmation code.
 */
export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/fridge';
  const urlMode = authModeFromSearch(searchParams);

  const [mode, setMode] = useState<AuthMode>(urlMode);
  const [signupStep, setSignupStep] = useState<SignupStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [suggestLogin, setSuggestLogin] = useState(false);
  const resendIntervalRef = useRef<number | null>(null);

  const passwordChecks = checkPassword(password);
  const passwordValid = allChecksPass(passwordChecks);
  const busy = loading || resendLoading;
  const activeIndex = slideIndex(mode, signupStep);

  const clearError = useCallback(() => {
    setAuthError(null);
    setSuggestLogin(false);
  }, []);

  const startResendCooldown = useCallback(() => {
    if (resendIntervalRef.current) {
      window.clearInterval(resendIntervalRef.current);
    }
    setResendCooldown(RESEND_COOLDOWN_SEC);
    resendIntervalRef.current = window.setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) {
            window.clearInterval(resendIntervalRef.current);
            resendIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) {
        window.clearInterval(resendIntervalRef.current);
      }
    };
  }, []);

  const applyAuthMode = useCallback(
    (next: AuthMode) => {
      clearError();
      setMode(next);
      setSignupStep('email');
      setPassword('');
      setVerificationCode('');
      setShowPassword(false);
      setResendCooldown(0);
    },
    [clearError]
  );

  useEffect(() => {
    applyAuthMode(urlMode);
  }, [urlMode, applyAuthMode]);

  useEffect(() => {
    setAuthNavListener((next) => {
      if (busy) return;
      applyAuthMode(next);
    });
    return () => setAuthNavListener(null);
  }, [busy, applyAuthMode]);

  function switchMode(next: AuthMode) {
    if (busy) return;
    if (urlMode === next) {
      applyAuthMode(next);
      return;
    }
    router.replace(buildLoginHref(next, searchParams));
  }

  function goToSignupStep(step: SignupStep) {
    clearError();
    setSignupStep(step);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      setAuthError('Enter your email and password.');
      return;
    }

    setLoading(true);
    clearError();
    const supabase = supabaseBrowser();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
      if (data.session) router.replace(redirectPath);
      else setAuthError('Could not start your session. Try again.');
    } catch (err: unknown) {
      setAuthError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !passwordValid) return;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setAuthError('Enter a valid email address.');
      goToSignupStep('email');
      return;
    }

    setLoading(true);
    clearError();
    const supabase = supabaseBrowser();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${getSiteUrl()}/auth/callback`,
        },
      });
      if (error) throw error;

      if (isDuplicateSignup(data, error)) {
        setAuthError('An account with this email already exists.');
        setSuggestLogin(true);
        return;
      }

      if (data.session) {
        router.replace('/fridge');
        return;
      }

      setVerificationCode('');
      goToSignupStep('verify');
      startResendCooldown();
    } catch (err: unknown) {
      setAuthError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const normalizedEmail = normalizeEmail(email);
    const token = verificationCode.trim();

    if (!normalizedEmail) {
      setAuthError('Your email was lost. Go back and sign up again.');
      return;
    }
    if (token.length !== OTP_LENGTH) {
      setAuthError(`Enter the ${OTP_LENGTH}-digit code from your email.`);
      return;
    }

    setLoading(true);
    clearError();
    const supabase = supabaseBrowser();
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: 'signup',
      });
      if (error) throw error;
      if (data.session) {
        router.replace('/fridge');
      } else {
        setAuthError('Confirmation succeeded but no session was created. Try logging in.');
      }
    } catch (err: unknown) {
      setAuthError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleResendCode() {
    if (busy || resendCooldown > 0) return;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      setAuthError('Your email was lost. Go back and sign up again.');
      return;
    }

    setResendLoading(true);
    clearError();
    const supabase = supabaseBrowser();
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: normalizedEmail,
      });
      if (error) throw error;
      setVerificationCode('');
      startResendCooldown();
    } catch (err: unknown) {
      setAuthError(authErrorMessage(err));
    } finally {
      setResendLoading(false);
    }
  }

  function handleSignupEmailNext(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!normalizeEmail(email)) {
      setAuthError('Enter a valid email address.');
      return;
    }
    clearError();
    setPassword('');
    setShowPassword(false);
    goToSignupStep('password');
  }

  return (
    <div className="auth-page">
      <div className="auth-form">
        <AuthBrand />
        <div className="auth-slider-viewport" aria-live="polite">
          <div
            className="auth-slider-track"
            style={{
              transform: `translateX(calc(-${activeIndex} * (100cqw + var(--auth-slider-gap))))`,
            }}
          >
            {/* Log in */}
            <div className="auth-slider-panel" aria-hidden={mode !== 'login'}>
              <h1 className="auth-title">Log in to chefAI</h1>
              <form onSubmit={handleLogin} className="auth-fields" noValidate>
                <label className="auth-label" htmlFor="login-email">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  className="auth-input"
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  required
                  autoComplete="email"
                  disabled={busy}
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
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError();
                    }}
                    required
                    autoComplete="current-password"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={busy}
                  >
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
                <AuthError message={authError} />
                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-landing-primary btn-auth-submit"
                >
                  {loading ? 'Logging in…' : 'Log in'}
                </button>
              </form>
              <p className="auth-switch">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => switchMode('signup')}
                  disabled={busy}
                >
                  Sign up
                </button>
              </p>
            </div>

            {/* Sign up — email */}
            <div
              className="auth-slider-panel"
              aria-hidden={mode !== 'signup' || signupStep !== 'email'}
            >
              <h1 className="auth-title">Sign up to start cooking</h1>
              <form onSubmit={handleSignupEmailNext} className="auth-fields" noValidate>
                <label className="auth-label" htmlFor="signup-email">
                  Email address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  className="auth-input"
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  required
                  autoComplete="email"
                  disabled={busy}
                />
                <AuthError message={mode === 'signup' && signupStep === 'email' ? authError : null} />
                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-landing-primary btn-auth-submit"
                >
                  Next
                </button>
              </form>
              <p className="auth-switch">
                Already have an account?{' '}
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => switchMode('login')}
                  disabled={busy}
                >
                  Log in
                </button>
              </p>
            </div>

            {/* Sign up — password */}
            <div
              className="auth-slider-panel"
              aria-hidden={mode !== 'signup' || signupStep !== 'password'}
            >
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  if (busy) return;
                  clearError();
                  setPassword('');
                  goToSignupStep('email');
                }}
                disabled={busy}
              >
                ← Back
              </button>
              <h1 className="auth-title">Create a password</h1>
              <form onSubmit={handleSignup} className="auth-fields" noValidate>
                <label className="auth-label" htmlFor="signup-password">
                  Password
                </label>
                <div className="auth-password-wrap">
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input auth-input--password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError();
                    }}
                    required
                    autoComplete="new-password"
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={busy}
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
                  <li className={passwordChecks.number ? 'met' : ''}>
                    <span className="auth-req-mark" aria-hidden="true">
                      {passwordChecks.number ? '✓' : '○'}
                    </span>
                    1 number
                  </li>
                  <li className={passwordChecks.special ? 'met' : ''}>
                    <span className="auth-req-mark" aria-hidden="true">
                      {passwordChecks.special ? '✓' : '○'}
                    </span>
                    1 special character (example: # ? ! &amp;)
                  </li>
                  <li className={passwordChecks.length ? 'met' : ''}>
                    <span className="auth-req-mark" aria-hidden="true">
                      {passwordChecks.length ? '✓' : '○'}
                    </span>
                    10 characters
                  </li>
                </ul>
                <AuthError
                  message={mode === 'signup' && signupStep === 'password' ? authError : null}
                  suggestLogin={suggestLogin}
                  onLogin={() => switchMode('login')}
                />
                <button
                  type="submit"
                  disabled={busy || !passwordValid}
                  className="btn btn-landing-primary btn-auth-submit"
                >
                  {loading ? 'Signing up…' : 'Sign up'}
                </button>
              </form>
            </div>

            {/* Sign up — verification code */}
            <div
              className="auth-slider-panel"
              aria-hidden={mode !== 'signup' || signupStep !== 'verify'}
            >
              <button
                type="button"
                className="auth-back"
                onClick={() => {
                  if (busy) return;
                  clearError();
                  setVerificationCode('');
                  goToSignupStep('password');
                }}
                disabled={busy}
              >
                ← Back
              </button>
              <h1 className="auth-title">Enter your code</h1>
              <p className="auth-hint">
                We sent a {OTP_LENGTH}-digit code to{' '}
                <span className="auth-hint-email">{normalizeEmail(email) || 'your email'}</span>.
                You can enter it below, or use the confirmation link in the same email.
              </p>
              <form onSubmit={handleVerify} className="auth-fields" noValidate>
                <label className="auth-label" htmlFor="signup-code">
                  Confirmation code
                </label>
                <input
                  id="signup-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="auth-input auth-input--code"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => {
                    setVerificationCode(sanitizeOtp(e.target.value));
                    clearError();
                  }}
                  maxLength={OTP_LENGTH}
                  disabled={busy}
                  aria-invalid={authError ? true : undefined}
                />
                <AuthError message={mode === 'signup' && signupStep === 'verify' ? authError : null} />
                <button
                  type="submit"
                  disabled={busy || verificationCode.length !== OTP_LENGTH}
                  className="btn btn-landing-primary btn-auth-submit"
                >
                  {loading ? 'Confirming…' : 'Confirm'}
                </button>
              </form>
              <p className="auth-switch">
                Didn&apos;t get a code?{' '}
                <button
                  type="button"
                  className="auth-link"
                  onClick={handleResendCode}
                  disabled={busy || resendCooldown > 0}
                >
                  {resendLoading
                    ? 'Sending…'
                    : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : 'Resend code'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
