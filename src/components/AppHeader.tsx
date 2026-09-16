'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/inventory-management', label: 'Inventory Mgmt' },
  { href: '/inventory-landed-cost', label: 'Landed Cost' },
  { href: '/inventory-counts', label: 'Counts' },
  { href: '/inventory-adjustments', label: 'Adjustments' },
  { href: '/inventory-loss-gain-report', label: 'Loss/Gain Report' },
  { href: '/analytics-sales', label: 'Sales Analytics' },
  { href: '/warehouses', label: 'Warehouses' },
  { href: '/orders', label: 'Orders' },
  { href: '/customers', label: 'Customers' },
  { href: '/channels', label: 'Channels' },
  { href: '/admin/users', label: 'Users' },
];

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const router = useRouter();
  const { user, tenantName, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Nestora Pulse — Inventory &amp; Sales Management
            </p>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {tenantName && (
              <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">
                {tenantName}
              </span>
            )}
            <span className="text-slate-600 text-sm">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-slate-600 hover:text-slate-900 text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
        <nav className="flex flex-wrap gap-4 mt-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium ${
                router.pathname === link.href
                  ? 'text-blue-700 underline underline-offset-4'
                  : 'text-blue-600 hover:underline'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
