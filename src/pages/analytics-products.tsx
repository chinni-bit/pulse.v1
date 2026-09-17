'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';
import { Granularity, DatePreset, DATE_PRESET_LABELS, presetRange, bucketKey, bucketLabel, startOfDay, endOfDay } from '@/lib/dateBuckets';

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  quantity_ordered: number | null;
  unit_price: number | null;
  is_cancelled: boolean;
}

interface OrderLite {
  id: string;
  order_number: string;
  channel: string;
  status: string;
  created_at: string;
}

interface ProductLite {
  id: string;
  sku: string;
  title: string;
  brand_name: string | null;
  cost: number | null;
  msrp: number | null;
  status: string;
}

interface LineItem {
  orderId: string;
  orderNumber: string;
  channel: string;
  date: Date;
  productId: string;
  sku: string;
  title: string;
  brand: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
  cogs: number;
  margin: number;
}

type Metric = 'REVENUE' | 'UNITS' | 'MARGIN';

type Selection =
  | { kind: 'chart'; bucket: string; brand: string }
  | { kind: 'product'; sku: string; title: string };

const METRIC_LABELS: Record<Metric, string> = {
  REVENUE: 'Revenue $',
  UNITS: 'Units',
  MARGIN: 'Margin $',
};

const BRAND_COLORS: Record<string, string> = {
  'Suite Bebe': '#2563eb',
  'Baby Cache': '#dc2626',
  'Centennial Nursery': '#16a34a',
  'Kingsley': '#d97706',
  'The 1st Chair': '#7c3aed',
  'Olive & Opie': '#0891b2',
};

const EXCLUDED_SKUS = new Set(['TEST-SKU-001']);

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function AnalyticsProducts() {
  const { tenantId } = useAuthStore();

  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [granularity, setGranularity] = useState<Granularity>('DAILY');
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [metric, setMetric] = useState<Metric>('REVENUE');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [selected, setSelected] = useState<Selection | null>(null);

  const fetchAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');

    const [{ data: itemsData }, { data: ordersData }, { data: productsData }] = await Promise.all([
      supabase.from('order_items').select('id, order_id, product_id, quantity_ordered, unit_price, is_cancelled').eq('tenant_id', tenantId),
      supabase.from('orders').select('id, order_number, channel, status, created_at').eq('tenant_id', tenantId),
      supabase.from('products').select('id, sku, title, brand_name, cost, msrp, status').eq('tenant_id', tenantId),
    ]);

    setOrderItems((itemsData as OrderItemRow[]) || []);
    setOrders((ordersData as OrderLite[]) || []);
    setProducts((productsData as ProductLite[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? endOfDay(new Date(customTo)) : null,
      };
    }
    return presetRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const catalog = useMemo(
    () => products.filter((p) => !EXCLUDED_SKUS.has(p.sku)),
    [products]
  );
  const brands = useMemo(
    () => Array.from(new Set(catalog.map((p) => p.brand_name || 'Unbranded'))).sort(),
    [catalog]
  );

  const allLineItems = useMemo(() => {
    const rows: LineItem[] = [];
    orderItems.forEach((oi) => {
      if (oi.is_cancelled) return;
      const order = orderById.get(oi.order_id);
      if (!order || order.status === 'CANCELLED') return;
      const product = productById.get(oi.product_id);
      if (!product || EXCLUDED_SKUS.has(product.sku)) return;
      const quantity = Number(oi.quantity_ordered || 0);
      const unitPrice = Number(oi.unit_price || 0);
      const cost = Number(product.cost || 0);
      const revenue = quantity * unitPrice;
      const cogs = quantity * cost;
      rows.push({
        orderId: order.id,
        orderNumber: order.order_number,
        channel: order.channel,
        date: new Date(order.created_at),
        productId: product.id,
        sku: product.sku,
        title: product.title,
        brand: product.brand_name || 'Unbranded',
        quantity,
        unitPrice,
        revenue,
        cogs,
        margin: revenue - cogs,
      });
    });
    return rows;
  }, [orderItems, orderById, productById]);

  const filteredLineItems = useMemo(() => {
    let rows = allLineItems;
    if (rangeFrom) rows = rows.filter((r) => r.date >= rangeFrom);
    if (rangeTo) rows = rows.filter((r) => r.date <= rangeTo);
    if (brandFilter !== 'ALL') rows = rows.filter((r) => r.brand === brandFilter);
    return rows;
  }, [allLineItems, rangeFrom, rangeTo, brandFilter]);

  const metricValue = (r: { revenue: number; margin: number } & ({ quantity: number } | { units: number })) =>
    metric === 'REVENUE' ? r.revenue : metric === 'UNITS' ? ('quantity' in r ? r.quantity : r.units) : r.margin;

  const brandKeys = useMemo(() => {
    if (brandFilter !== 'ALL') return [brandFilter];
    return Array.from(new Set(filteredLineItems.map((r) => r.brand))).sort();
  }, [filteredLineItems, brandFilter]);

  const chartData = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();
    filteredLineItems.forEach((r) => {
      const key = bucketKey(r.date, granularity);
      const row = buckets.get(key) || {};
      row[r.brand] = (row[r.brand] || 0) + metricValue(r);
      buckets.set(key, row);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, values]) => ({ key, label: bucketLabel(key, granularity), ...values }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLineItems, granularity, metric]);

  const productAgg = useMemo(() => {
    const scoped = brandFilter === 'ALL' ? catalog : catalog.filter((p) => (p.brand_name || 'Unbranded') === brandFilter);
    return scoped.map((p) => {
      const lines = filteredLineItems.filter((r) => r.productId === p.id);
      const units = lines.reduce((s, r) => s + r.quantity, 0);
      const revenue = lines.reduce((s, r) => s + r.revenue, 0);
      const cogs = lines.reduce((s, r) => s + r.cogs, 0);
      const margin = revenue - cogs;
      return {
        sku: p.sku,
        title: p.title,
        brand: p.brand_name || 'Unbranded',
        status: p.status,
        units,
        revenue,
        cogs,
        margin,
        marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
      };
    });
  }, [catalog, brandFilter, filteredLineItems]);

  const companyTotals = useMemo(() => {
    const revenue = filteredLineItems.reduce((s, r) => s + r.revenue, 0);
    const cogs = filteredLineItems.reduce((s, r) => s + r.cogs, 0);
    const units = filteredLineItems.reduce((s, r) => s + r.quantity, 0);
    const margin = revenue - cogs;
    return { revenue, cogs, units, margin, marginPct: revenue > 0 ? (margin / revenue) * 100 : 0 };
  }, [filteredLineItems]);

  const topSellers = useMemo(
    () => [...productAgg].sort((a, b) => metricValue(b) - metricValue(a)).slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productAgg, metric]
  );
  const bottomSellers = useMemo(
    () => [...productAgg].sort((a, b) => metricValue(a) - metricValue(b)).slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productAgg, metric]
  );

  const detailRows = useMemo(() => {
    if (!selected) return [];
    if (selected.kind === 'chart') {
      return filteredLineItems
        .filter((r) => bucketKey(r.date, granularity) === selected.bucket && r.brand === selected.brand)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((r) => ({
          orderNumber: r.orderNumber,
          date: r.date.toLocaleDateString(),
          sku: r.sku,
          title: r.title,
          channel: r.channel,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          revenue: r.revenue,
          margin: r.margin,
        }));
    }
    return filteredLineItems
      .filter((r) => r.sku === selected.sku)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((r) => ({
        orderNumber: r.orderNumber,
        date: r.date.toLocaleDateString(),
        sku: r.sku,
        title: r.title,
        channel: r.channel,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        revenue: r.revenue,
        margin: r.margin,
      }));
  }, [selected, filteredLineItems, granularity]);

  return (
    <ProtectedRoute>
      <Head>
        <title>Product Performance - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Product Performance" />

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
                      onClick={() => { setGranularity(g); setSelected(null); }}
                      className={`px-3 py-1.5 ${granularity === g ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {g.charAt(0) + g.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date Range</label>
                <select value={datePreset} onChange={(e) => { setDatePreset(e.target.value as DatePreset); setSelected(null); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((p) => (
                    <option key={p} value={p}>{DATE_PRESET_LABELS[p]}</option>
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Metric</label>
                <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
                  {(['REVENUE', 'UNITS', 'MARGIN'] as Metric[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMetric(m); setSelected(null); }}
                      className={`px-3 py-1.5 ${metric === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {METRIC_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Brand</label>
                <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setSelected(null); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="ALL">All Brands</option>
                  {brands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Company totals */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Totals — {DATE_PRESET_LABELS[datePreset]}{brandFilter !== 'ALL' ? ` · ${brandFilter}` : ''}</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Units Sold</p>
                  <p className="text-lg font-semibold text-slate-900">{companyTotals.units}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Revenue</p>
                  <p className="text-lg font-semibold text-slate-900">{money(companyTotals.revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">COGS</p>
                  <p className="text-lg font-semibold text-slate-900">{money(companyTotals.cogs)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Margin $</p>
                  <p className="text-lg font-semibold text-slate-900">{money(companyTotals.margin)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Margin %</p>
                  <p className="text-lg font-semibold text-slate-900">{pct(companyTotals.marginPct)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Leaderboards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Top Sellers — by {METRIC_LABELS[metric]}</h2>
              {topSellers.length === 0 ? (
                <p className="text-sm text-slate-500">No products.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-3">SKU</th>
                      <th className="py-1.5 pr-3">Units</th>
                      <th className="py-1.5 pr-3">Revenue</th>
                      <th className="py-1.5 pr-3">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topSellers.map((p) => (
                      <tr
                        key={p.sku}
                        onClick={() => setSelected({ kind: 'product', sku: p.sku, title: p.title })}
                        className={`cursor-pointer hover:bg-slate-50 ${selected?.kind === 'product' && selected.sku === p.sku ? 'bg-blue-50' : ''}`}
                      >
                        <td className="py-1 pr-3">
                          <div className="font-medium">{p.sku}</div>
                          <div className="text-xs text-slate-400">{p.title}</div>
                        </td>
                        <td className="py-1 pr-3">{p.units}</td>
                        <td className="py-1 pr-3">{money(p.revenue)}</td>
                        <td className="py-1 pr-3">{p.revenue > 0 ? pct(p.marginPct) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Bottom Sellers — by {METRIC_LABELS[metric]}</h2>
              {bottomSellers.length === 0 ? (
                <p className="text-sm text-slate-500">No products.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-3">SKU</th>
                      <th className="py-1.5 pr-3">Units</th>
                      <th className="py-1.5 pr-3">Revenue</th>
                      <th className="py-1.5 pr-3">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bottomSellers.map((p) => (
                      <tr
                        key={p.sku}
                        onClick={() => setSelected({ kind: 'product', sku: p.sku, title: p.title })}
                        className={`cursor-pointer hover:bg-slate-50 ${selected?.kind === 'product' && selected.sku === p.sku ? 'bg-blue-50' : ''}`}
                      >
                        <td className="py-1 pr-3">
                          <div className="font-medium">{p.sku}</div>
                          <div className="text-xs text-slate-400">{p.title}</div>
                        </td>
                        <td className="py-1 pr-3">{p.units}</td>
                        <td className="py-1 pr-3">{money(p.revenue)}</td>
                        <td className="py-1 pr-3">{p.revenue > 0 ? pct(p.marginPct) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-xs text-slate-400 mt-2">Click any row to see its order-line detail.</p>
            </div>
          </div>

          {/* Performance chart */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              {METRIC_LABELS[metric]} by Brand Over Time
            </h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No product sales in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value, name) => [metric === 'UNITS' ? value : money(Number(value)), name]} />
                  <Legend />
                  {brandKeys.map((b) => (
                    <Bar
                      key={b}
                      dataKey={b}
                      stackId="a"
                      fill={BRAND_COLORS[b] || '#64748b'}
                      cursor="pointer"
                      onClick={(data) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const payload = (data as any)?.payload as { key?: string } | undefined;
                        if (payload?.key) setSelected({ kind: 'chart', bucket: payload.key, brand: b });
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-slate-400 mt-2">Click a bar segment to see that brand&apos;s order lines for that period.</p>
          </div>

          {selected && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                  {selected.kind === 'chart'
                    ? `Detail — ${selected.brand}, ${bucketLabel(selected.bucket, granularity)} (${detailRows.length} line${detailRows.length === 1 ? '' : 's'})`
                    : `Detail — ${selected.sku} (${selected.title}) — ${detailRows.length} line${detailRows.length === 1 ? '' : 's'}`}
                </h2>
                <button onClick={() => setSelected(null)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
              </div>
              {detailRows.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing here.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-4">Order #</th>
                      <th className="py-1.5 pr-4">Date</th>
                      {selected.kind === 'chart' && <th className="py-1.5 pr-4">SKU</th>}
                      <th className="py-1.5 pr-4">Channel</th>
                      <th className="py-1.5 pr-4">Qty</th>
                      <th className="py-1.5 pr-4">Unit Price</th>
                      <th className="py-1.5 pr-4">Revenue</th>
                      <th className="py-1.5 pr-4">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-4 font-medium">{r.orderNumber}</td>
                        <td className="py-1 pr-4">{r.date}</td>
                        {selected.kind === 'chart' && <td className="py-1 pr-4">{r.sku}</td>}
                        <td className="py-1 pr-4">{r.channel}</td>
                        <td className="py-1 pr-4">{r.quantity}</td>
                        <td className="py-1 pr-4">{money(r.unitPrice)}</td>
                        <td className="py-1 pr-4">{money(r.revenue)}</td>
                        <td className="py-1 pr-4">{money(r.margin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
