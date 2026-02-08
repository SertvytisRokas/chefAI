"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { SupabaseClient, Session, User } from '@supabase/supabase-js';
import { supabaseBrowser } from '../lib/supabase/client';

/**
 * Context value containing the Supabase client, current session and user.
 */
interface SupabaseContextValue {
  supabase: SupabaseClient;
  session: Session | null;
  user: User | null;
}

const SupabaseContext = createContext<SupabaseContextValue | undefined>(
  undefined
);

/**
 * `SupabaseProvider` instantiates a browser Supabase client once and
 * provides it along with the current session and user to all
 * descendants. It also listens for auth state changes and updates
 * the context accordingly. This mirrors the behaviour of
 * `@supabase/auth-helpers-react`'s `SessionContextProvider` without
 * relying on deprecated packages.
 */
export default function SupabaseProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [supabase] = useState(() => supabaseBrowser());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Load the initial session from Supabase.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });
    // Subscribe to auth state changes.
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });
    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

  return (
    <SupabaseContext.Provider value={{ supabase, session, user }}>
      {children}
    </SupabaseContext.Provider>
  );
}

/**
 * Returns the Supabase context. Components calling this hook must be
 * wrapped in a `SupabaseProvider` somewhere higher in the component
 * tree. Throws if used outside of a provider.
 */
export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return ctx;
}

/**
 * Returns the currently authenticated user from context. Components
 * calling this hook must be wrapped in a `SupabaseProvider`.
 */
export function useUser() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error('useUser must be used within a SupabaseProvider');
  }
  return ctx.user;
}

/**
 * Returns the current auth session from context. Components calling
 * this hook must be wrapped in a `SupabaseProvider`.
 */
export function useSession() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SupabaseProvider');
  }
  return ctx.session;
}