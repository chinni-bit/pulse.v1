import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuthStore } from '@/store/authStore';

/**
 * Smart routing based on auth state
 * - Authenticated users -> /dashboard
 * - Unauthenticated users -> /login
 * - Loading indicator while checking auth
 */
export default function Home() {
  const router = useRouter();
  const { user, isLoading, checkAuth } = useAuthStore();

  // See ProtectedRoute.tsx for why this flag matters: without it, this
  // redirects to /login on the render before checkAuth's first result
  // comes back, intermittently bouncing already-logged-in users.
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkAuth().finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!checked || isLoading) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [checked, user, isLoading, router]);

  return (
    <>
      <Head>
        <title>Nestora Pulse</title>
      </Head>
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </main>
    </>
  );
}
