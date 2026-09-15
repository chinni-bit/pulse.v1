'use client';

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { DetailModal } from '@/components/DetailModal';
import { supabase } from '@/lib/supabase';

interface InventoryStats {
  activeSKUs: number;
  totalUnits: number;
  warehouses: number;
  lowStockCount: number;
  outOfStockCount: number;
}

interface StockRow {
  id: string;
  sku: string;
  title: string;
  available: number;
  reorder_threshold: number;
}

interface SyncStatus {
  channel: string;
  lastSync: string | null;
  status: 'success' | 'failed' | 'pending';
  nextSync: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart Marketplace (WM3P)',
  AMAZON3P: 'Amazon (AMAZON3P)',
};

export default function Dashboard() {
  const { tenantId } = useAuthStore();
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockRows, setLowStockRows] = useState<StockRow[]>([]);
  const [outOfStockRows, setOutOfStockRows] = useState<StockRow[]>([]);
  const [drilldown, setDrilldown] = useState<'LOW_STOCK' | 'OUT_OF_STOCK' | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        // Fetch inventory stats - active products only, per owner feedback
        // that "Total SKUs" was less useful than "Active SKUs."
        const { data: products } = await supabase
          .from('products')
          .select('id, sku, title, reorder_threshold, status')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);

        const activeProducts = (products || []).filter((p) => p.status === 'ACTIVE');

        // Only active warehouses count toward the tile - deactivated
        // warehouses (see /warehouses) are excluded.
        const { data: warehouses } = await supabase
          .from('warehouses')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('is_active', true);

        // Inventory totals are scoped to active warehouses via
        // batch_locations (owner's call 2026-09-15: every inventory batch
        // upload will assign a warehouse via batch_locations going
        // forward, so this is the correct source of truth going forward -
        // not the warehouse-agnostic inventory_batches.quantity_available
        // used previously). Batches with no batch_locations row yet
        // (nothing uploaded that way so far) won't count here until they
        // are assigned a warehouse.
        const { data: locations } = await supabase
          .from('batch_locations')
          .select('quantity, inventory_batches!inner(product_id), warehouses!inner(is_active)')
          .eq('tenant_id', tenantId)
          .eq('warehouses.is_active', true);

        const availableByProduct = new Map<string, number>();
        let totalUnits = 0;
        (locations as unknown as { quantity: number; inventory_batches: { product_id: string } }[] || []).forEach(
          (loc) => {
            const productId = loc.inventory_batches.product_id;
            const qty = loc.quantity || 0;
            availableByProduct.set(productId, (availableByProduct.get(productId) || 0) + qty);
            totalUnits += qty;
          }
        );
        const lowStock = activeProducts
          .filter((p) => (availableByProduct.get(p.id) || 0) < p.reorder_threshold)
          .map((p) => ({
            id: p.id,
            sku: p.sku,
            title: p.title,
            available: availableByProduct.get(p.id) || 0,
            reorder_threshold: p.reorder_threshold,
          }));
        const outOfStock = activeProducts
          .filter((p) => (availableByProduct.get(p.id) || 0) <= 0)
          .map((p) => ({
            id: p.id,
            sku: p.sku,
            title: p.title,
            available: availableByProduct.get(p.id) || 0,
            reorder_threshold: p.reorder_threshold,
          }));

        setLowStockRows(lowStock);
        setOutOfStockRows(outOfStock);

        setStats({
          activeSKUs: activeProducts.length,
          totalUnits,
          warehouses: warehouses?.length || 0,
          lowStockCount: lowStock.length,
          outOfStockCount: outOfStock.length,
        });

        // Sync status per channel, driven by the channels table (the
        // source of truth for last_sync_at and each channel's configured
        // interval), not just the most recent log line.
        const { data: channelsData } = await supabase
          .from('channels')
          .select('channel_name, is_active, last_sync_at, sync_frequency_minutes')
          .eq('tenant_id', tenantId)
          .order('channel_name', { ascending: true });

        const statuses: SyncStatus[] = (channelsData || []).map((c) => {
          const lastSyncDate = c.last_sync_at ? new Date(c.last_sync_at) : null;
          const nextSyncDate = lastSyncDate
            ? new Date(lastSyncDate.getTime() + c.sync_frequency_minutes * 60 * 1000)
            : null;
          return {
            channel: CHANNEL_LABELS[c.channel_name] || c.channel_name,
            lastSync: lastSyncDate ? lastSyncDate.toLocaleString() : 'Never',
            status: lastSyncDate ? 'success' : 'pending',
            nextSync: nextSyncDate ? nextSyncDate.toLocaleString() : '—',
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
  }, [tenantId]);

  return (
    <ProtectedRoute>
      <Head>
        <title>Dashboard - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Dashboard" />

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
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Active SKUs */}
                  <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-slate-600 text-sm font-medium">Active SKUs</div>
                    <div className="text-4xl font-bold text-slate-900 mt-2">{stats?.activeSKUs || 0}</div>
                    <div className="text-slate-500 text-xs mt-2">Status = Active</div>
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
                  <button
                    onClick={() => setDrilldown('LOW_STOCK')}
                    className="bg-white rounded-lg shadow p-6 text-left hover:ring-2 hover:ring-orange-300 transition-shadow"
                  >
                    <div className="text-slate-600 text-sm font-medium">Low Stock</div>
                    <div className="text-4xl font-bold text-orange-600 mt-2">{stats?.lowStockCount || 0}</div>
                    <div className="text-slate-500 text-xs mt-2">Below reorder threshold - click to view</div>
                  </button>

                  {/* Out of Stock */}
                  <button
                    onClick={() => setDrilldown('OUT_OF_STOCK')}
                    className="bg-white rounded-lg shadow p-6 text-left hover:ring-2 hover:ring-red-300 transition-shadow"
                  >
                    <div className="text-slate-600 text-sm font-medium">Out of Stock</div>
                    <div className="text-4xl font-bold text-red-600 mt-2">{stats?.outOfStockCount || 0}</div>
                    <div className="text-slate-500 text-xs mt-2">Zero units available - click to view</div>
                  </button>
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

              {/* Status Notice */}
              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Live:</strong> Inventory — {' '}
                  <Link href="/products" className="underline font-medium">
                    products
                  </Link>
                  ,{' '}
                  <Link href="/warehouses" className="underline font-medium">
                    warehouses
                  </Link>
                  . Channel sync — order pull and inventory push are working for{' '}
                  <Link href="/channels" className="underline font-medium">
                    Wayfair and Walmart
                  </Link>
                  ; Amazon isn&apos;t connected yet.
                </p>
              </div>
            </>
          )}
        </div>

        {drilldown && (
          <DetailModal
            title={drilldown === 'LOW_STOCK' ? 'Low Stock SKUs' : 'Out of Stock SKUs'}
            onClose={() => setDrilldown(null)}
          >
            {(drilldown === 'LOW_STOCK' ? lowStockRows : outOfStockRows).length === 0 ? (
              <p className="text-sm text-slate-500">Nothing here.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-4">SKU</th>
                    <th className="py-1 pr-4">Title</th>
                    <th className="py-1 pr-4">Available</th>
                    <th className="py-1">Reorder Threshold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(drilldown === 'LOW_STOCK' ? lowStockRows : outOfStockRows).map((row) => (
                    <tr key={row.id}>
                      <td className="py-1.5 pr-4 font-medium">{row.sku}</td>
                      <td className="py-1.5 pr-4">{row.title}</td>
                      <td className="py-1.5 pr-4">{row.available}</td>
                      <td className="py-1.5">{row.reorder_threshold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DetailModal>
        )}
      </main>
    </ProtectedRoute>
  );
}
