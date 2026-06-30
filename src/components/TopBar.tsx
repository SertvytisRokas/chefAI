"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSupabase, useUser } from './SupabaseProvider';

/**
 * Top bar component for the Meal Genius app.  Displays the
 * application title on the left and the current user's email on
 * the right.  Clicking the email toggles a dropdown with links to
 * the profile page and a logout button.  Unauthenticated users
 * instead see a login link.  All styles are defined in
 * `globals.css` via the `.top-bar` class and related selectors.
 */
export default function TopBar() {
  const router = useRouter();
  const { supabase } = useSupabase();
  const user = useUser();
  const [open, setOpen] = useState(false);

  // Ref to the container that includes the button and dropdown. Used
  // to detect clicks outside the dropdown and close it accordingly.
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when the user clicks or taps outside of it.  We
  // attach listeners for both mouse and touch events so that the
  // dropdown closes properly on desktop and mobile.  The handler runs
  // only when the dropdown is open.  Using mousedown and touchstart
  // ensures the dropdown closes before other click handlers execute.
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // force refresh and redirect to login
    router.replace('/login');
  };

  return (
    <header className="top-bar">
      <div className="title">chefAI</div>
      <div style={{ position: 'relative' }} ref={containerRef}>
        {user ? (
          <button
            onClick={() => setOpen(!open)}
            className="profile-button"
          >
            {user.email}
            <span style={{ marginLeft: '0.25rem' }}>
              {open ? '▴' : '▾'}
            </span>
          </button>
        ) : (
          <Link href="/login">Login</Link>
        )}
        {open && user && (
          <div className="dropdown">
            <Link href="/profile" onClick={() => setOpen(false)}>
              Profile
            </Link>
            <button onClick={handleLogout}>Log out</button>
          </div>
        )}
      </div>
    </header>
  );
}