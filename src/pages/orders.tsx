'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { DetailModal, DetailField } from '@/components/DetailModal';
import { supabase } from '@/lib/supabase';

interface Order {
  id: string;
  order_number: string;
  channel: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_id: string | null;
  customer_group_id: string | null;
  customers: { name: string } | null;
  customer_groups: { name: string } | null;
  status: string;
  total_amount: number;
  shipping_address: string | null;
  created_at: string;
}

interface CustomerOption {
  id: string;
  name: string;
  customer_group_id: string | null;
}

interface CustomerGroupOption {
  id: string;
  name: string;
}

interface OrderItem {
  id: string;
  order_id: string;
  quantity_ordered: number;
  unit_price: number;
  is_cancelled: boolean;
  product: { sku: string; title: string } | null;
}

export const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart Marketplace (WM3P)',
  AMAZON3P: 'Amazon (AMAZON3P)',
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
type SortKey = 'order_number' | 'channel' | 'status' | 'total_amount' | 'created_at';

type DatePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'YEAR_TO_DATE'
  | 'ALL_TIME'
  | 'CUSTOM';

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  LAST_7_DAYS: 'Last 7 Days',
  LAST_30_DAYS: 'Last 30 Days',
  THIS_MONTH: 'Month to Date',
  YEAR_TO_DATE: 'Year to Date',
  ALL_TIME: 'All Time',
  CUSTOM: 'Custom Range',
};

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function presetRange(preset: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case 'TODAY':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'YESTERDAY': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'LAST_7_DAYS': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case 'LAST_30_DAYS': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case 'THIS_MONTH':
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case 'YEAR_TO_DATE':
      return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
    case 'ALL_TIME':
      return { from: null, to: null };
    case 'CUSTOM':
      return { from: null, to: null };
  }
}

export default function Orders() {
  const { tenantId } = useAuthStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [customerGroupOptions, setCustomerGroupOptions] = useState<CustomerGroupOption[]>([]);
  const [assigning, setAssigning] = useState(false);

  const [channelFilter, setChannelFilter] = useState('ALL');
  const [customerGroupFilter, setCustomerGroupFilter] = useState('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Order | null>(null);

  const fetchOrders = async () => {
    if (!tenantId) return;
    setLoading(true);
    setListError('');

    const { data, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, channel, customer_name, customer_email, customer_id, customer_group_id, customers(name), customer_groups(name), status, total_amount, shipping_address, created_at'
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      setListError(error.message);
      setLoading(false);
      return;
    }

    setOrders((data as unknown as Order[]) || []);

    const orderIds = (data || []).map((o) => o.id);
    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('id, order_id, quantity_ordered, unit_price, is_cancelled, product:products(sku, title)')
        .in('order_id', orderIds);

      const grouped: Record<string, OrderItem[]> = {};
      (items as unknown as OrderItem[] || []).forEach((item) => {
        (grouped[item.order_id] ||= []).push(item);
      });
      setItemsByOrder(grouped);
    } else {
      setItemsByOrder({});
    }

    setLoading(false);
  };

  const fetchCustomerOptions = async () => {
    if (!tenantId) return;
    const [{ data: customersData }, { data: groupsData }] = await Promise.all([
      supabase.from('customers').select('id, name, customer_group_id').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      supabase.from('customer_groups').select('id, name').eq('tenant_id', tenantId).order('name'),
    ]);
    setCustomerOptions(customersData || []);
    setCustomerGroupOptions(groupsData || []);
  };

  const assignOrderCustomer = async (order: Order, customerId: string, customerGroupId: string) => {
    setAssigning(true);
    const { error } = await supabase
      .from('orders')
      .update({ customer_id: customerId || null, customer_group_id: customerGroupId || null })
      .eq('id', order.id);
    setAssigning(false);

    if (error) {
      setListError(error.message);
      return;
    }
    await fetchOrders();
  };

  useEffect(() => {
    fetchOrders();
    fetchCustomerOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    setPage(1);
  }, [channelFilter, customerGroupFilter, pageSize, datePreset, customFrom, customTo]);

  const channelOptions = useMemo(() => {
    const set = new Set(orders.map((o) => o.channel));
    return Array.from(set).sort();
  }, [orders]);

  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? endOfDay(new Date(customTo)) : null,
      };
    }
    return presetRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  const filteredSorted = useMemo(() => {
    let filtered = channelFilter === 'ALL' ? orders : orders.filter((o) => o.channel === channelFilter);
    if (customerGroupFilter === 'UNATTRIBUTED') {
      filtered = filtered.filter((o) => !o.customer_id && !o.customer_group_id);
    } else if (customerGroupFilter !== 'ALL') {
      filtered = filtered.filter((o) => o.customer_group_id === customerGroupFilter);
    }
    if (rangeFrom) filtered = filtered.filter((o) => new Date(o.created_at) >= rangeFrom);
    if (rangeTo) filtered = filtered.filter((o) => new Date(o.created_at) <= rangeTo);

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'total_amount') {
        cmp = a.total_amount - b.total_amount;
      } else {
        cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [orders, channelFilter, rangeFrom, rangeTo, sortKey, sortDir]);

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

  const itemsSummary = (orderId: string) => {
    const items = itemsByOrder[orderId] || [];
    if (items.length === 0) return '—';
    const shown = items.slice(0, 2).map((it) => it.product?.sku || '?').join(', ');
    return items.length > 2 ? `${shown} +${items.length - 2} more` : shown;
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
            <div className="flex flex-wrap items-center gap-3">
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
              <select
                value={customerGroupFilter}
                onChange={(e) => setCustomerGroupFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="ALL">All customer groups</option>
                <option value="UNATTRIBUTED">Unattributed</option>
                {customerGroupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p) => (
                  <option key={p} value={p}>
                    {DATE_PRESET_LABELS[p]}
                  </option>
                ))}
              </select>
              {datePreset === 'CUSTOM' && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                  />
                  <span className="text-slate-400 text-sm">to</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm"
                  />
                </>
              )}
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
                        ['order_number', 'Order #', 'w-36'],
                        ['channel', 'Channel', 'w-44'],
                        ['status', 'Status', 'w-28'],
                        ['total_amount', 'Total', 'w-24'],
                        ['created_at', 'Date', 'w-40'],
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
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Items</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 w-40">Customer / Group</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paged.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td
                        className="px-6 py-4 text-sm font-medium text-blue-700 hover:underline truncate cursor-pointer"
                        onClick={() => setViewing(order)}
                      >
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
                      <td className="px-6 py-4 text-sm text-slate-600 truncate" title={itemsSummary(order.id)}>
                        {itemsSummary(order.id)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 truncate">
                        {order.customers?.name || order.customer_groups?.name || (
                          <span className="text-slate-400 italic">Unattributed</span>
                        )}
                      </td>
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

        {viewing && (
          <DetailModal title={`Order ${viewing.order_number}`} onClose={() => setViewing(null)}>
            <DetailField label="Channel" value={CHANNEL_LABELS[viewing.channel] || viewing.channel} />
            <DetailField label="Status" value={viewing.status} />
            <DetailField label="Total" value={`$${Number(viewing.total_amount).toFixed(2)}`} />
            <DetailField label="Date" value={new Date(viewing.created_at).toLocaleString()} />
            <DetailField label="Customer (from channel)" value={viewing.customer_name} />
            <DetailField label="Customer Email (from channel)" value={viewing.customer_email} />
            <DetailField label="Shipping Address" value={viewing.shipping_address} />
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Attributed Customer / Group
              </div>
              <div className="flex gap-2">
                <select
                  value={viewing.customer_id || ''}
                  disabled={assigning}
                  onChange={async (e) => {
                    const customerId = e.target.value;
                    const selected = customerOptions.find((c) => c.id === customerId);
                    const groupId = selected ? selected.customer_group_id || '' : viewing.customer_group_id || '';
                    await assignOrderCustomer(viewing, customerId, groupId);
                    setViewing({ ...viewing, customer_id: customerId || null, customer_group_id: groupId || null });
                  }}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">No specific customer</option>
                  {customerOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={viewing.customer_group_id || ''}
                  disabled={assigning || !!viewing.customer_id}
                  onChange={async (e) => {
                    const groupId = e.target.value;
                    await assignOrderCustomer(viewing, '', groupId);
                    setViewing({ ...viewing, customer_id: null, customer_group_id: groupId || null });
                  }}
                  className="flex-1 px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                >
                  <option value="">No group</option>
                  {customerGroupOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Picking a customer sets their group automatically. Clear the customer to assign at the group level
                only (e.g. a generic Wayfair order not tied to a specific account).
              </p>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Items</div>
              {(itemsByOrder[viewing.id] || []).length === 0 ? (
                <p className="text-sm text-slate-500">No matched line items.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-4">SKU</th>
                      <th className="py-1 pr-4">Title</th>
                      <th className="py-1 pr-4">Qty</th>
                      <th className="py-1">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(itemsByOrder[viewing.id] || []).map((item) => (
                      <tr key={item.id} className={item.is_cancelled ? 'text-slate-400 line-through' : ''}>
                        <td className="py-1.5 pr-4 font-medium">{item.product?.sku || '—'}</td>
                        <td className="py-1.5 pr-4">{item.product?.title || '—'}</td>
                        <td className="py-1.5 pr-4">{item.quantity_ordered}</td>
                        <td className="py-1.5">${Number(item.unit_price).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </DetailModal>
        )}
      </main>
    </ProtectedRoute>
  );
}
