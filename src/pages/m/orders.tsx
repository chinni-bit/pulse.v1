'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MobileLayout } from '@/components/MobileLayout';
import { DetailModal, DetailField } from '@/components/DetailModal';
import { supabase } from '@/lib/supabase';

interface Order {
  id: string;
  order_number: string;
  channel: string;
  customer_name: string | null;
  status: string;
  total_amount: number;
  shipping_address: string | null;
  created_at: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart',
  AMAZON3P: 'Amazon',
  SHOPIFY: 'Shopify',
};

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: 'bg-green-100 text-green-800',
  SHIPPED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-amber-100 text-amber-800',
  PENDING: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-800',
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function MobileOrders() {
  const { tenantId } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const fetchOrders = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, channel, customer_name, status, total_amount, shipping_address, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(100);
      setOrders((data as Order[]) || []);
      setLoading(false);
    };
    fetchOrders();
  }, [tenantId]);

  const statusOptions = useMemo(() => ['ALL', ...Array.from(new Set(orders.map((o) => o.status))).sort()], [orders]);

  const filtered = useMemo(() => {
    let rows = orders;
    if (statusFilter !== 'ALL') rows = rows.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((o) => o.order_number.toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q));
    }
    return rows;
  }, [orders, statusFilter, search]);

  return (
    <ProtectedRoute>
      <MobileLayout title="Orders">
        <div className="space-y-2 mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order # or customer..."
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No orders match.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelected(o)}
                className="w-full bg-white rounded-xl shadow-sm p-3 text-left flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{o.order_number}</p>
                  <p className="text-xs text-slate-500">{CHANNEL_LABELS[o.channel] || o.channel} · {new Date(o.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">{money(Number(o.total_amount || 0))}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[o.status] || 'bg-slate-100 text-slate-600'}`}>{o.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <DetailModal title={selected.order_number} onClose={() => setSelected(null)}>
            <DetailField label="Channel" value={CHANNEL_LABELS[selected.channel] || selected.channel} />
            <DetailField label="Status" value={selected.status} />
            <DetailField label="Customer" value={selected.customer_name || '—'} />
            <DetailField label="Total" value={money(Number(selected.total_amount || 0))} />
            <DetailField label="Shipping Address" value={selected.shipping_address || '—'} />
            <DetailField label="Date" value={new Date(selected.created_at).toLocaleString()} />
          </DetailModal>
        )}
      </MobileLayout>
    </ProtectedRoute>
  );
}
