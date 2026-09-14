import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, isLoading, checkAuth } = useAuthStore();

  // Tracks whether checkAuth's *first* call has resolved. Without this,
  // the redirect effect below can fire on the render that happens before
  // checkAuth has set isLoading:true (Zustand's initial state is
  // isLoading:false, user:null - indistinguishable from "checked and
  // logged out"), sending a genuinely logged-in user back to /login
  // before the real auth check ever comes back. This was intermittent:
  // it depended on exact render/network timing, so it worked sometimes
  // and bounced others with no code change.
  const [checked, setChecked] = useState(false);

  // TEMP DIAGNOSTIC - remove once login bounce-back is confirmed fixed
  console.log('[ProtectedRoute] render', { checked, isLoading, hasUser: !!user });

  useEffect(() => {
    console.log('[ProtectedRoute] mount effect: calling checkAuth()');
    checkAuth().finally(() => {
      console.log('[ProtectedRoute] checkAuth().finally -> setChecked(true)');
      setChecked(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkAuth]);

  useEffect(() => {
    console.log('[ProtectedRoute] redirect-effect eval', { checked, isLoading, hasUser: !!user });
    if (checked && !isLoading && !user) {
      console.log('[ProtectedRoute] REDIRECTING to /login');
      router.push('/login');
    }
  }, [checked, isLoading, user, router]);

  if (!checked || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
