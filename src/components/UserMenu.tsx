"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSupabase, useUser } from './SupabaseProvider';

function avatarLetter(email: string | undefined): string {
  if (!email) return '?';
  return email.trim().charAt(0).toUpperCase();
}

/**
 * Round avatar button with profile / log out dropdown.
 */
export default function UserMenu() {
  const router = useRouter();
  const { supabase } = useSupabase();
  const user = useUser();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (!open) return;
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  if (!user) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-menu-avatar"
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-expanded={open}
      >
        {avatarLetter(user.email)}
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <p className="user-menu-email">{user.email}</p>
          <Link href="/profile" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
