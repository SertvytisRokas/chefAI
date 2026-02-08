"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSupabase, useUser } from './SupabaseProvider';

/**
 * A responsive navigation bar that appears on all pages. The left side
 * contains primary navigation links (Fridge and Genius) and the right
 * side shows the current user's email with a dropdown menu to open
 * the profile or log out. Styling is intentionally minimal to avoid
 * coupling the logic to any particular CSS framework.
 */
export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { supabase } = useSupabase();
  const user = useUser();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // After signing out, refresh the page so that server components
    // reflect the logged-out state. Redirect to login page.
    router.replace('/login');
  };

  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
      <div className="flex space-x-4">
        <Link
          href="/fridge"
          className={
            pathname === '/fridge'
              ? 'font-semibold text-blue-600'
              : 'text-gray-700 hover:text-blue-600'
          }
        >
          Fridge
        </Link>
        <Link
          href="/genius"
          className={
            pathname === '/genius'
              ? 'font-semibold text-blue-600'
              : 'text-gray-700 hover:text-blue-600'
          }
        >
          Genius
        </Link>
      </div>
      <div className="relative">
        {user ? (
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            <span>{user.email}</span>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={open ? 'M19 9l-7 7-7-7' : 'M19 15l-7-7-7 7'}
              />
            </svg>
          </button>
        ) : (
          <Link href="/login" className="text-gray-700 hover:text-blue-600">
            Login
          </Link>
        )}
        {open && user && (
          <div className="absolute right-0 mt-2 w-32 bg-white shadow-lg rounded-md border border-gray-200 z-10">
            <Link
              href="/profile"
              className="block px-4 py-2 hover:bg-gray-100"
              onClick={() => setOpen(false)}
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 hover:bg-gray-100"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}