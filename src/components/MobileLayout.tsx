'use client';

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';

interface Tab {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

const iconProps = (active: boolean) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: active ? '#2563eb' : '#94a3b8',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

const TABS: Tab[] = [
  {
    href: '/m/dashboard',
    label: 'Dashboard',
    icon: (active) => (
      <svg {...iconProps(active)}><path d="M3 12l9-9 9 9" /><path d="M5 10v10h14V10" /></svg>
    ),
  },
  {
    href: '/m/inventory',
    label: 'Inventory',
    icon: (active) => (
      <svg {...iconProps(active)}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
    ),
  },
  {
    href: '/m/orders',
    label: 'Orders',
    icon: (active) => (
      <svg {...iconProps(active)}><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>
    ),
  },
  {
    href: '/m/sync',
    label: 'Sync',
    icon: (active) => (
      <svg {...iconProps(active)}><path d="M3 12a9 9 0 0115-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
    ),
  },
];

interface MobileLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function MobileLayout({ title, children }: MobileLayoutProps) {
  const router = useRouter();
  const { tenantName, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Head>
        <title>{title} - Nestora Pulse</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Pulse" />
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>

      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Nestora Pulse · Read-Only</p>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {tenantName && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded-full">{tenantName}</span>
          )}
          <button onClick={handleLogout} className="text-slate-400 text-xs font-medium">Logout</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">{children}</main>

      <nav
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map((tab) => {
          const active = router.pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center gap-0.5 py-2"
            >
              {tab.icon(active)}
              <span className={`text-[11px] font-medium ${active ? 'text-blue-600' : 'text-slate-400'}`}>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
