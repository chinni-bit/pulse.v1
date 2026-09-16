'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface Order {
  id: string;
  order_number: string;
  channel: string;
  customer_id: string | null;
  customer_group_id: string | null;
  status: string;
  total_amount: number;
  created_at: string;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity_ordered: number;
  unit_price: number;
  is_cancelled: boolean;
}

interface Product {
  id: string;
  sku: string;
  title: string;
  brand_name: string | null;
}

interface CustomerGroup {
  id: string;
  name: string;
}

type Granularity = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type DatePreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'ALL_TIME' | 'CUSTOM';
type Breakdown = 'NONE' | 'CHANNEL' | 'CUSTOMER_GROUP' | 'BRAND' | 'PRODUCT';

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  TODAY: 'Today',
  THIS_WEEK: 'This Week',
  THIS_MONTH: 'This Month',
  THIS_YEAR: 'This Year',
  ALL_TIME: 'All Time',
  CUSTOM: 'Custom Range',
};

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart',
  AMAZON3P: 'Amazon',
};

const SERIES_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

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
    case 'THIS_WEEK': {
      const from = new Date(now);
      from.setDate(from.getDate() - from.getDay());
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case 'THIS_MONTH':
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(now) };
    case 'THIS_YEAR':
      return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
    case 'ALL_TIME':
      return { from: null, to: null };
    case 'CUSTOM':
      return { from: null, to: null };
  }
}

function bucketKey(date: Date, granularity: Granularity): string {
  // Local calendar-day components throughout - the DB stores timezone-naive
  // timestamps (no offset), so consistently treating them as local wall-clock
  // time (not UTC via toISOString) is what keeps two genuinely different
  // local dates from merging into one bucket.
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  if (granularity === 'DAILY') {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (granularity === 'WEEKLY') {
    const weekStart = new Date(y, m, d - date.getDay());
    return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'MONTHLY') {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (granularity === 'WEEKLY') return `Wk of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const money = (n: number) => `$${n.toFixed(2)}`;

export default function AnalyticsSales() {
  const { tenantId } = useAuthStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [granularity, setGranularity] = useState<Granularity>('DAILY');
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [breakdown, setBreakdown] = useState<Breakdown>('NONE');
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const fetchAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');

    const [{ data: ordersData }, { data: itemsData }, { data: productsData }, { data: groupsData }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, channel, customer_id, customer_group_id, status, total_amount, created_at')
        .eq('tenant_id', tenantId),
      supabase.from('order_items').select('id, order_id, product_id, quantity_ordered, unit_price, is_cancelled').eq('tenant_id', tenantId),
      supabase.from('products').select('id, sku, title, brand_name').eq('tenant_id', tenantId),
      supabase.from('customer_groups').select('id, name').eq('tenant_id', tenantId),
    ]);

    setOrders((ordersData as Order[]) || []);
    setItems((itemsData as OrderItem[]) || []);
    setProducts((productsData as Product[]) || []);
    setCustomerGroups((groupsData as CustomerGroup[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const groupById = useMemo(() => new Map(customerGroups.map((g) => [g.id, g])), [customerGroups]);
  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    items.forEach((it) => {
      if (it.is_cancelled) return;
      (map.get(it.order_id) || map.set(it.order_id, []).get(it.order_id)!).push(it);
    });
    return map;
  }, [items]);

  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? endOfDay(new Date(customTo)) : null,
      };
    }
    return presetRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  const filteredOrders = useMemo(() => {
    let rows = orders.filter((o) => o.status !== 'CANCELLED');
    if (rangeFrom) rows = rows.filter((o) => new Date(o.created_at) >= rangeFrom);
    if (rangeTo) rows = rows.filter((o) => new Date(o.created_at) <= rangeTo);
    return rows;
  }, [orders, rangeFrom, rangeTo]);

  const filteredOrderIds = useMemo(() => new Set(filteredOrders.map((o) => o.id)), [filteredOrders]);
  const orderById = useMemo(() => new Map(filteredOrders.map((o) => [o.id, o])), [filteredOrders]);

  // Series keys present in the breakdown (e.g. channel codes, group names, brand names, product SKUs)
  const seriesKeys = useMemo(() => {
    if (breakdown === 'NONE') return ['Revenue'];
    if (breakdown === 'CHANNEL') return Array.from(new Set(filteredOrders.map((o) => CHANNEL_LABELS[o.channel] || o.channel))).sort();
    if (breakdown === 'CUSTOMER_GROUP') {
      const keys = new Set(filteredOrders.map((o) => (o.customer_group_id ? groupById.get(o.customer_group_id)?.name || 'Unknown Group' : 'Unattributed')));
      return Array.from(keys).sort();
    }
    if (breakdown === 'BRAND') {
      const keys = new Set<string>();
      filteredOrders.forEach((o) => {
        (itemsByOrder.get(o.id) || []).forEach((it) => {
          keys.add(productById.get(it.product_id)?.brand_name || 'Unknown Brand');
        });
      });
      return Array.from(keys).sort();
    }
    // PRODUCT: top 5 by revenue in range
    const revenueByProduct = new Map<string, number>();
    filteredOrders.forEach((o) => {
      (itemsByOrder.get(o.id) || []).forEach((it) => {
        const rev = it.unit_price * it.quantity_ordered;
        revenueByProduct.set(it.product_id, (revenueByProduct.get(it.product_id) || 0) + rev);
      });
    });
    return Array.from(revenueByProduct.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pid]) => productById.get(pid)?.sku || pid);
  }, [breakdown, filteredOrders, itemsByOrder, productById, groupById]);

  // Chart data: one row per bucket, one column per series key
  const chartData = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();

    const addTo = (key: string, series: string, value: number) => {
      const row = buckets.get(key) || {};
      row[series] = (row[series] || 0) + value;
      buckets.set(key, row);
    };

    if (breakdown === 'NONE' || breakdown === 'CHANNEL' || breakdown === 'CUSTOMER_GROUP') {
      filteredOrders.forEach((o) => {
        const key = bucketKey(new Date(o.created_at), granularity);
        let series = 'Revenue';
        if (breakdown === 'CHANNEL') series = CHANNEL_LABELS[o.channel] || o.channel;
        if (breakdown === 'CUSTOMER_GROUP') series = o.customer_group_id ? groupById.get(o.customer_group_id)?.name || 'Unknown Group' : 'Unattributed';
        addTo(key, series, Number(o.total_amount || 0));
      });
    } else {
      // BRAND or PRODUCT: item-level
      filteredOrders.forEach((o) => {
        const key = bucketKey(new Date(o.created_at), granularity);
        (itemsByOrder.get(o.id) || []).forEach((it) => {
          const rev = it.unit_price * it.quantity_ordered;
          let series: string;
          if (breakdown === 'BRAND') {
            series = productById.get(it.product_id)?.brand_name || 'Unknown Brand';
          } else {
            const sku = productById.get(it.product_id)?.sku || it.product_id;
            if (!seriesKeys.includes(sku)) return; // fold non-top-5 into nothing (keeps chart readable)
            series = sku;
          }
          addTo(key, series, rev);
        });
      });
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, values]) => ({ key, label: bucketLabel(key, granularity), ...values }));
  }, [filteredOrders, itemsByOrder, granularity, breakdown, productById, groupById, seriesKeys]);

  // Detail rows for the selected bucket (orders/items contributing to it)
  const detailRows = useMemo(() => {
    if (!selectedBucket) return [];
    const rows: { orderNumber: string; date: string; channel: string; sku: string; title: string; qty: number; value: number }[] = [];

    filteredOrders.forEach((o) => {
      if (bucketKey(new Date(o.created_at), granularity) !== selectedBucket) return;
      if (!filteredOrderIds.has(o.id)) return;

      if (breakdown === 'NONE' || breakdown === 'CHANNEL' || breakdown === 'CUSTOMER_GROUP') {
        rows.push({
          orderNumber: o.order_number,
          date: new Date(o.created_at).toLocaleDateString(),
          channel: CHANNEL_LABELS[o.channel] || o.channel,
          sku: '—',
          title: '(whole order)',
          qty: (itemsByOrder.get(o.id) || []).reduce((s, it) => s + it.quantity_ordered, 0),
          value: Number(o.total_amount || 0),
        });
      } else {
        (itemsByOrder.get(o.id) || []).forEach((it) => {
          const p = productById.get(it.product_id);
          rows.push({
            orderNumber: o.order_number,
            date: new Date(o.created_at).toLocaleDateString(),
            channel: CHANNEL_LABELS[o.channel] || o.channel,
            sku: p?.sku || '—',
            title: p?.title || '—',
            qty: it.quantity_ordered,
            value: it.unit_price * it.quantity_ordered,
          });
        });
      }
    });

    return rows;
  }, [selectedBucket, filteredOrders, filteredOrderIds, itemsByOrder, granularity, breakdown, productById]);

  const totalRevenue = chartData.reduce(
    (sum, row) => sum + seriesKeys.reduce((s, k) => s + (Number((row as Record<string, number | string>)[k]) || 0), 0),
    0
  );

  return (
    <ProtectedRoute>
      <Head>
        <title>Sales Analytics - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Sales / Revenue Trends" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Granularity</label>
                <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
                  {(['DAILY', 'WEEKLY', 'MONTHLY'] as Granularity[]).map((g) => (
                    <button
                      key={g}
                      onClick={() => {
                        setGranularity(g);
                        setSelectedBucket(null);
                      }}
                      className={`px-3 py-1.5 ${granularity === g ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {g.charAt(0) + g.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date Range</label>
                <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value as DatePreset); setSelectedBucket(null); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p) => (
                    <option key={p} value={p}>
                      {DATE_PRESET_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              {datePreset === 'CUSTOM' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">From</label>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">To</label>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Break down by</label>
                <select value={breakdown} onChange={(e) => { setBreakdown(e.target.value as Breakdown); setSelectedBucket(null); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="NONE">Overall (no breakdown)</option>
                  <option value="CHANNEL">Channel</option>
                  <option value="CUSTOMER_GROUP">Customer Group</option>
                  <option value="BRAND">Brand</option>
                  <option value="PRODUCT">Product (top 5)</option>
                </select>
              </div>
              <p className="text-sm text-slate-500 pb-1.5">Total in range: {money(totalRevenue)}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : chartData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No orders in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={chartData} onClick={(state) => {
                  const label = state?.activeLabel;
                  const row = chartData.find((r) => r.label === label);
                  if (row) setSelectedBucket(row.key);
                }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  {seriesKeys.length > 1 && <Legend />}
                  {seriesKeys.map((key, i) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={SERIES_COLORS[i % SERIES_COLORS.length]} cursor="pointer" />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-slate-400 mt-2">Click a bar to see the orders/items behind that period.</p>
          </div>

          {selectedBucket && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                  Detail — {bucketLabel(selectedBucket, granularity)} ({detailRows.length} row{detailRows.length === 1 ? '' : 's'})
                </h2>
                <button onClick={() => setSelectedBucket(null)} className="text-sm text-slate-500 hover:text-slate-700">
                  Close
                </button>
              </div>
              {detailRows.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing here.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 pr-4">Order #</th>
                        <th className="py-1.5 pr-4">Date</th>
                        <th className="py-1.5 pr-4">Channel</th>
                        <th className="py-1.5 pr-4">SKU</th>
                        <th className="py-1.5 pr-4">Title</th>
                        <th className="py-1.5 pr-4">Qty</th>
                        <th className="py-1.5 pr-4">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailRows.map((r, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-4 font-medium">{r.orderNumber}</td>
                          <td className="py-1 pr-4">{r.date}</td>
                          <td className="py-1 pr-4">{r.channel}</td>
                          <td className="py-1 pr-4">{r.sku}</td>
                          <td className="py-1 pr-4">{r.title}</td>
                          <td className="py-1 pr-4">{r.qty}</td>
                          <td className="py-1 pr-4">{money(r.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
