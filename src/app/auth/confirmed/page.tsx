import Link from 'next/link';

export default function EmailConfirmedPage() {
  return (
    <div className="auth-page">
      <div className="auth-form auth-confirmed">
        <h1 className="auth-title">Email confirmed</h1>
        <p className="auth-hint auth-hint--confirmed">
          Your account is ready. You can start using chefAI.
        </p>
        <Link href="/fridge" className="btn btn-landing-primary btn-auth-submit">
          Done
        </Link>
      </div>
    </div>
  );
}
