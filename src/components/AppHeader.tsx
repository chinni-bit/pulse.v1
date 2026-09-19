'use client';

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
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
  { href: '/analytics-channels', label: 'Channel Analytics' },
  { href: '/analytics-products', label: 'Product Analytics' },
  { href: '/analytics-inventory', label: 'Inventory Trends' },
  { href: '/analytics-loss-gain', label: 'Loss/Gain Trends' },
  { href: '/orders', label: 'Orders' },
  { href: '/customers', label: 'Customers' },
];

const SETTINGS_LINKS = [
  { href: '/admin/users', label: 'Users' },
  { href: '/warehouses', label: 'Warehouses' },
  { href: '/admin/product-types', label: 'Product Types' },
  { href: '/admin/customer-groups', label: 'Customer Groups' },
  { href: '/admin/customer-integrations', label: 'Integrations' },
  { href: '/admin/tenant-info', label: 'Tenant Info' },
];

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const router = useRouter();
  const { user, tenantName, logout } = useAuthStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const isSettingsRoute = SETTINGS_LINKS.some((link) => link.href === router.pathname);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setSettingsOpen(false);
  }, [router.pathname]);

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
            <div className="relative" ref={settingsRef}>
              <button
                onClick={() => setSettingsOpen((prev) => !prev)}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg ${
                  isSettingsRoute ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                Settings
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {settingsOpen && (
                <div className="absolute left-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
                  {SETTINGS_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`block px-4 py-2 text-sm ${
                        router.pathname === link.href
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
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
