'use client';

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supabase } from '@/lib/supabase';

interface InventoryStats {
  totalSKUs: number;
  totalUnits: number;
  warehouses: number;
  lowStockCount: number;
}

interface SyncStatus {
  channel: string;
  lastSync: string | null;
  status: 'success' | 'failed' | 'pending';
  nextSync: string;
}

export default function Dashboard() {
  const router = useRouter();
  const { user, tenantId, logout } = useAuthStore();
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !tenantId) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        // Fetch inventory stats
        const { data: products } = await supabase
          .from('products')
          .select('id')
          .eq('tenant_id', tenantId);

        const { data: batches } = await supabase
          .from('inventory_batches')
          .select('quantity_available')
          .eq('tenant_id', tenantId);

        const { data: warehouses } = await supabase
          .from('warehouses')
          .select('id')
          .eq('tenant_id', tenantId);

        const totalUnits = batches?.reduce((sum, b) => sum + (b.quantity_available || 0), 0) || 0;

        setStats({
          totalSKUs: products?.length || 0,
          totalUnits,
          warehouses: warehouses?.length || 0,
          lowStockCount: 0, // TODO: Implement low stock threshold
        });

        // Fetch sync logs for status
        const { data: syncLogs } = await supabase
          .from('sync_logs')
          .select('channel, status, completed_at')
          .eq('tenant_id', tenantId)
          .order('started_at', { ascending: false })
          .limit(3);

        const channels = ['Amazon', 'Walmart', 'Wayfair'];
        const statuses: SyncStatus[] = channels.map((channel) => {
          const lastLog = syncLogs?.find((log) => log.channel?.includes(channel));
          return {
            channel,
            lastSync: lastLog?.completed_at ? new Date(lastLog.completed_at).toLocaleString() : 'Never',
            status: lastLog?.status === 'success' ? 'success' : 'pending',
            nextSync: new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString(), // 5 min from now
          };
        });

        setSyncStatus(statuses);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, tenantId]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Dashboard - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Nestora Pulse</h1>
              <p className="text-slate-600 text-sm">Inventory Management Dashboard</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-slate-600">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-slate-600">Loading dashboard...</p>
            </div>
          ) : (
            <>
              {/* Inventory Stats */}
              <section className="mb-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Inventory Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Total SKUs */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-slate-600 text-sm font-medium">Total SKUs</div>
                    <div className="text-4xl font-bold text-slate-900 mt-2">{stats?.totalSKUs || 0}</div>
                    <div className="text-slate-500 text-xs mt-2">Unique products</div>
                  </div>

                  {/* Total Units */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-slate-600 text-sm font-medium">Total Units</div>
                    <div className="text-4xl font-bold text-slate-900 mt-2">{stats?.totalUnits || 0}</div>
                    <div className="text-slate-500 text-xs mt-2">Across all warehouses</div>
                  </div>

                  {/* Warehouses */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-slate-600 text-sm font-medium">Warehouses</div>
                    <div className="text-4xl font-bold text-slate-900 mt-2">{stats?.warehouses || 0}</div>
                    <div className="text-slate-500 text-xs mt-2">Active locations</div>
                  </div>

                  {/* Low Stock */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-slate-600 text-sm font-medium">Low Stock</div>
                    <div className="text-4xl font-bold text-orange-600 mt-2">{stats?.lowStockCount || 0}</div>
                    <div className="text-slate-500 text-xs mt-2">Items to reorder</div>
                  </div>
                </div>
              </section>

              {/* Sync Status */}
              <section>
                <h2 className="text-xl font-bold text-slate-900 mb-4">Channel Sync Status</h2>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Channel</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Last Sync</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Next Sync</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {syncStatus.map((sync) => (
                        <tr key={sync.channel} className="hover:bg-slate-50">
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{sync.channel}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{sync.lastSync}</td>
                          <td className="px-6 py-4 text-sm">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                sync.status === 'success'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {sync.status === 'success' ? '✓ Success' : '⏳ Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{sync.nextSync}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Phase 1A Notice */}
              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Phase 1A:</strong> Basic dashboard with inventory stats and sync status. Inventory CRUD and channel sync
                  implementation coming Day 2.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
