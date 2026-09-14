import Head from 'next/head';
import Link from 'next/link';

/**
 * Self-service signup is intentionally disabled for Phase 1.
 * Only admins create user accounts (directly in Supabase for now,
 * until an admin panel exists). Anyone hitting this URL - whether
 * they know about it or not - should not be able to create an account.
 */
export default function Signup() {
  return (
    <>
      <Head>
        <title>Sign Up - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-slate-900">Nestora Pulse</h1>
          <p className="text-slate-600 mt-2 mb-8">Multi-tenant Inventory Dashboard</p>

          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-3">Signups are disabled</h2>
            <p className="text-slate-600 text-sm mb-6">
              Accounts are created by an administrator. If you're expecting access,
              contact your admin to have an account created for you.
            </p>
            <Link
              href="/login"
              className="inline-block w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
