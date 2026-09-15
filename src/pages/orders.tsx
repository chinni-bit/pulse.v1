'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface Order {
  id: string;
  order_number: string;
  channel: string;
  customer_name: string | null;
  status: string;
  total_amount: number;
  created_at: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart Marketplace (WM3P)',
  AMAZON3P: 'Amazon (AMAZON3P)',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
type SortKey = 'order_number' | 'channel' | 'status' | 'total_amount' | 'created_at';

export default function Orders() {
  const { tenantId } = useAuthStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [channelFilter, setChannelFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const fetchOrders = async () => {
    if (!tenantId) return;
    setLoading(true);
    setListError('');

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, channel, customer_name, status, total_amount, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      setListError(error.message);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    setPage(1);
  }, [channelFilter, pageSize]);

  const channelOptions = useMemo(() => {
    const set = new Set(orders.map((o) => o.channel));
    return Array.from(set).sort();
  }, [orders]);

  const filteredSorted = useMemo(() => {
    const filtered = channelFilter === 'ALL' ? orders : orders.filter((o) => o.channel === channelFilter);
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'total_amount') {
        cmp = a.total_amount - b.total_amount;
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [orders, channelFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = filteredSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created_at' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Orders - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Orders" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <p className="text-slate-600 text-sm">
              {filteredSorted.length} of {orders.length} order{orders.length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-3">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="ALL">All channels</option>
                {channelOptions.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c] || c}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <label htmlFor="pageSize">Rows per page</label>
                <select
                  id="pageSize"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {listError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {listError}
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-4 text-slate-600">Loading orders...</p>
              </div>
            ) : filteredSorted.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {orders.length === 0
                  ? 'No orders yet. Pull orders from a channel on the Channels page.'
                  : 'No orders match this filter.'}
              </div>
            ) : (
              <table className="min-w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {(
                      [
                        ['order_number', 'Order #', 'w-40'],
                        ['channel', 'Channel', 'w-56'],
                        ['status', 'Status', 'w-32'],
                        ['total_amount', 'Total', 'w-28'],
                        ['created_at', 'Date', 'w-48'],
                      ] as [SortKey, string, string][]
                    ).map(([key, label, width]) => (
                      <th
                        key={key}
                        className={`px-6 py-3 text-left text-sm font-semibold text-slate-900 ${width} cursor-pointer select-none hover:text-blue-700`}
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        {sortKey === key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Customer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paged.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 truncate">
                        {order.order_number}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate">
                        {CHANNEL_LABELS[order.channel] || order.channel}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            order.status === 'CANCELLED'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        ${Number(order.total_amount).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {new Date(order.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate">{order.customer_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filteredSorted.length > 0 && (
            <div className="flex justify-between items-center mt-4 text-sm text-slate-600">
              <span>
                Page {currentPage} of {pageCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
