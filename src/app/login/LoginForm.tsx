"use client";

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabase/client';

/**
 * Login/sign-up form. Reads `redirect` from the query string (requires Suspense parent).
 */
export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/fridge';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = supabaseBrowser();
    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        if (data.session) {
          router.replace(redirectPath);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });
        if (error) throw error;
        if (data.session) {
          router.replace('/profile');
        } else {
          alert('Check your email for a confirmation link.');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      alert(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <h1>{mode === 'login' ? 'Sign In' : 'Create Account'}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading} className="btn w-full">
          {loading ? 'Submitting…' : mode === 'login' ? 'Sign In' : 'Sign Up'}
        </button>
      </form>
      <p className="mt-4" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
        {mode === 'login' ? 'Need an account?' : 'Already have an account?'}{' '}
        <button
          type="button"
          className="switch-link"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        >
          {mode === 'login' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}
