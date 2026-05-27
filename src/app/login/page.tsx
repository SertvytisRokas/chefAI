import { Suspense } from 'react';
import LoginForm from './LoginForm';

/**
 * Login and sign up page. Users can either create a new account or
 * authenticate with an existing one. After successful authentication
 * they are redirected to the page specified by the `redirect` query
 * parameter or to the fridge by default.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-container">
          <h1>Sign In</h1>
          <p>Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
