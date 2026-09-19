'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MobileLayout } from '@/components/MobileLayout';
import { supabase } from '@/lib/supabase';

interface Stats {
  activeSKUs: number;
  totalUnits: number;
  warehouses: number;
  lowStockCount: number;
  outOfStockCount: number;
}

interface RecentOrder {
  id: string;
  order_number: string;
  channel: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface SyncRow {
  channel: string;
  isActive: boolean;
  lastSync: string | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart',
  AMAZON3P: 'Amazon',
  SHOPIFY: 'Shopify',
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function MobileDashboard() {
  const { tenantId } = useAuthStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [syncRows, setSyncRows] = useState<SyncRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    const fetchAll = async () => {
      setLoading(true);

      const { data: products } = await supabase
        .from('products')
        .select('id, reorder_threshold, status')
        .eq('tenant_id', tenantId)
        .is('deactivated_at', null);
      const activeProducts = (products || []).filter((p) => p.status === 'ACTIVE');

      const { data: warehouses } = await supabase
        .from('warehouses')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      const { data: locations } = await supabase
        .from('batch_locations')
        .select('quantity, inventory_batches!inner(product_id), warehouses!inner(is_active)')
        .eq('tenant_id', tenantId)
        .eq('warehouses.is_active', true);

      const availableByProduct = new Map<string, number>();
      let totalUnits = 0;
      (locations as unknown as { quantity: number; inventory_batches: { product_id: string } }[] || []).forEach((loc) => {
        const productId = loc.inventory_batches.product_id;
        const qty = loc.quantity || 0;
        availableByProduct.set(productId, (availableByProduct.get(productId) || 0) + qty);
        totalUnits += qty;
      });
      const lowStockCount = activeProducts.filter((p) => (availableByProduct.get(p.id) || 0) < p.reorder_threshold && (availableByProduct.get(p.id) || 0) > 0).length;
      const outOfStockCount = activeProducts.filter((p) => (availableByProduct.get(p.id) || 0) <= 0).length;

      setStats({
        activeSKUs: activeProducts.length,
        totalUnits,
        warehouses: warehouses?.length || 0,
        lowStockCount,
        outOfStockCount,
      });

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, channel, status, total_amount, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      setRecentOrders((orders as RecentOrder[]) || []);

      const { data: channelsData } = await supabase
        .from('channels')
        .select('channel_name, is_active, last_sync_at')
        .eq('tenant_id', tenantId)
        .order('channel_name', { ascending: true });
      setSyncRows((channelsData || []).map((c) => ({
        channel: CHANNEL_LABELS[c.channel_name] || c.channel_name,
        isActive: c.is_active,
        lastSync: c.last_sync_at,
      })));

      setLoading(false);
    };

    fetchAll();
  }, [tenantId]);

  return (
    <ProtectedRoute>
      <MobileLayout title="Dashboard">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-slate-500">Active SKUs</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats?.activeSKUs ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-slate-500">Total Units</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats?.totalUnits ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-slate-500">Warehouses</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats?.warehouses ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-slate-500">Low / Out of Stock</p>
                <p className="text-2xl font-bold mt-1">
                  <span className="text-orange-600">{stats?.lowStockCount ?? 0}</span>
                  <span className="text-slate-300 mx-1">/</span>
                  <span className="text-red-600">{stats?.outOfStockCount ?? 0}</span>
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wide mb-3">Channel Sync</h2>
              {syncRows.length === 0 ? (
                <p className="text-sm text-slate-500">No channels configured.</p>
              ) : (
                <div className="space-y-2">
                  {syncRows.map((s) => (
                    <div key={s.channel} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{s.channel}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{s.lastSync ? new Date(s.lastSync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}</span>
                        <span className={`inline-block w-2 h-2 rounded-full ${s.isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wide mb-3">Recent Orders (7 days)</h2>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-slate-500">No orders in the last 7 days.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentOrders.map((o) => (
                    <div key={o.id} className="py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{o.order_number}</p>
                        <p className="text-xs text-slate-400">{CHANNEL_LABELS[o.channel] || o.channel} · {o.status}</p>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{money(Number(o.total_amount || 0))}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </MobileLayout>
    </ProtectedRoute>
  );
}
