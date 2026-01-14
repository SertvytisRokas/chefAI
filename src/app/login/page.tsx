"use client";

import { useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
    } else {
      router.push('/fridge');
    }
    setLoading(false);
  };

  const handleSignup = async () => {
    setLoading(true);
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
    } else {
      // After sign-up, redirect to fridge so the user can start adding items
      router.push('/fridge');
    }
    setLoading(false);
  };

  return (
    <div className="max-w-sm mx-auto mt-16 bg-white p-6 rounded shadow">
      <h1 className="text-xl font-semibold mb-4">Login or Sign Up</h1>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <div className="space-y-4">
        <input
          type="email"
          className="w-full border rounded px-3 py-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="w-full border rounded px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-2 rounded"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Login'}
        </button>
        <button
          onClick={handleSignup}
          className="w-full bg-gray-200 text-gray-800 py-2 rounded"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Sign Up'}
        </button>
      </div>
    </div>
  );
}