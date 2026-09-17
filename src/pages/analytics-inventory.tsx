'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';
import { Granularity, DatePreset, DATE_PRESET_LABELS, presetRange, bucketKey, bucketLabel, startOfDay, endOfDay } from '@/lib/dateBuckets';

interface Adjustment {
  id: string;
  product_id: string;
  warehouse_id: string;
  adjustment_type: string;
  reason_code: string;
  quantity: number;
  total_value: number;
  status: string;
  submitted_at: string;
}
interface QcHold {
  id: string;
  batch_id: string;
  warehouse_id: string;
  quantity: number;
  reason: string;
  status: string;
  placed_at: string;
}
interface Transfer {
  id: string;
  batch_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  quantity: number;
  status: string;
  initiated_at: string;
}
interface CountRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  counted_quantity: number;
  system_quantity_at_count: number;
  variance: number;
  counted_at: string;
}
interface ProductLite {
  id: string;
  sku: string;
  title: string;
}
interface WarehouseLite {
  id: string;
  code: string;
  name: string;
}
interface BatchLite {
  id: string;
  product_id: string;
  quantity_available: number;
  status: string;
}
interface BatchLocation {
  batch_id: string;
  warehouse_id: string;
  quantity: number;
}

interface ActivityEvent {
  id: string;
  date: Date;
  category: 'ADJUSTMENT' | 'TRANSFER' | 'QC_HOLD' | 'COUNT';
  warehouseId: string;
  description: string;
  quantity: number;
  valueImpact: number | null;
}

const CATEGORY_LABELS: Record<ActivityEvent['category'], string> = {
  ADJUSTMENT: 'Adjustments',
  TRANSFER: 'Transfers',
  QC_HOLD: 'QC Holds',
  COUNT: 'Counts',
};
const CATEGORY_COLORS: Record<ActivityEvent['category'], string> = {
  ADJUSTMENT: '#dc2626',
  TRANSFER: '#2563eb',
  QC_HOLD: '#d97706',
  COUNT: '#16a34a',
};

const REAL_WAREHOUSE_CODES = ['MS/WH800', 'NJ/WH100', 'WFS/WH200'];

const money = (n: number) => `$${n.toFixed(2)}`;

export default function AnalyticsInventory() {
  const { tenantId } = useAuthStore();

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [qcHolds, setQcHolds] = useState<QcHold[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseLite[]>([]);
  const [batches, setBatches] = useState<BatchLite[]>([]);
  const [batchLocations, setBatchLocations] = useState<BatchLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [granularity, setGranularity] = useState<Granularity>('DAILY');
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL');
  const [selected, setSelected] = useState<{ bucket: string; category: ActivityEvent['category'] } | null>(null);

  const fetchAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');

    const [
      { data: adjData },
      { data: qcData },
      { data: xferData },
      { data: countData },
      { data: prodData },
      { data: whData },
      { data: batchData },
      { data: locData },
    ] = await Promise.all([
      supabase.from('inventory_adjustments').select('id, product_id, warehouse_id, adjustment_type, reason_code, quantity, total_value, status, submitted_at').eq('tenant_id', tenantId).eq('status', 'APPROVED'),
      supabase.from('inventory_qc_holds').select('id, batch_id, warehouse_id, quantity, reason, status, placed_at').eq('tenant_id', tenantId),
      supabase.from('inventory_transfers').select('id, batch_id, from_warehouse_id, to_warehouse_id, quantity, status, initiated_at').eq('tenant_id', tenantId),
      supabase.from('inventory_counts').select('id, product_id, warehouse_id, counted_quantity, system_quantity_at_count, variance, counted_at').eq('tenant_id', tenantId),
      supabase.from('products').select('id, sku, title').eq('tenant_id', tenantId),
      supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId),
      supabase.from('inventory_batches').select('id, product_id, quantity_available, status').eq('tenant_id', tenantId),
      supabase.from('batch_locations').select('batch_id, warehouse_id, quantity').eq('tenant_id', tenantId),
    ]);

    setAdjustments((adjData as Adjustment[]) || []);
    setQcHolds((qcData as QcHold[]) || []);
    setTransfers((xferData as Transfer[]) || []);
    setCounts((countData as CountRow[]) || []);
    setProducts((prodData as ProductLite[]) || []);
    setWarehouses((whData as WarehouseLite[]) || []);
    setBatches((batchData as BatchLite[]) || []);
    setBatchLocations((locData as BatchLocation[]) || []);
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

  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const realWarehouses = useMemo(() => warehouses.filter((w) => REAL_WAREHOUSE_CODES.includes(w.code)), [warehouses]);

  // Live current-state snapshot across the 5 inventory buckets established in
  // the Warehouse/Inventory Management module - not date-filtered, this is
  // "right now", same bucket definitions used there.
  const snapshot = useMemo(() => {
    const onHand = batchLocations.reduce((s, l) => s + l.quantity, 0);
    const locByBatch = new Map<string, number>();
    batchLocations.forEach((l) => locByBatch.set(l.batch_id, (locByBatch.get(l.batch_id) || 0) + l.quantity));
    const unassigned = batches
      .filter((b) => b.status === 'RECEIVED')
      .reduce((s, b) => s + Math.max(0, Number(b.quantity_available || 0) - (locByBatch.get(b.id) || 0)), 0);
    const inTransit = transfers.filter((t) => t.status === 'IN_TRANSIT').reduce((s, t) => s + t.quantity, 0);
    const onWater = batches.filter((b) => b.status === 'ON_WATER').reduce((s, b) => s + Number(b.quantity_available || 0), 0);
    const qcHold = qcHolds.filter((q) => q.status === 'HOLDING').reduce((s, q) => s + q.quantity, 0);
    return { onHand, unassigned, inTransit, onWater, qcHold, total: onHand + unassigned + inTransit + onWater + qcHold };
  }, [batchLocations, batches, transfers, qcHolds]);

  const allEvents = useMemo(() => {
    const events: ActivityEvent[] = [];
    adjustments.forEach((a) => {
      const p = productById.get(a.product_id);
      events.push({
        id: a.id,
        date: new Date(a.submitted_at),
        category: 'ADJUSTMENT',
        warehouseId: a.warehouse_id,
        description: `${a.adjustment_type} - ${a.reason_code} (${p?.sku || 'Unknown SKU'})`,
        quantity: a.quantity,
        valueImpact: a.adjustment_type === 'LOSS' ? -Number(a.total_value || 0) : Number(a.total_value || 0),
      });
    });
    qcHolds.forEach((q) => {
      const b = batchById.get(q.batch_id);
      const p = b ? productById.get(b.product_id) : undefined;
      events.push({
        id: q.id,
        date: new Date(q.placed_at),
        category: 'QC_HOLD',
        warehouseId: q.warehouse_id,
        description: `QC Hold placed - ${q.reason} (${p?.sku || 'Unknown SKU'}) [${q.status}]`,
        quantity: q.quantity,
        valueImpact: null,
      });
    });
    transfers.forEach((t) => {
      const b = batchById.get(t.batch_id);
      const p = b ? productById.get(b.product_id) : undefined;
      const fromCode = warehouseById.get(t.from_warehouse_id)?.code || '?';
      const toCode = warehouseById.get(t.to_warehouse_id)?.code || '?';
      events.push({
        id: t.id,
        date: new Date(t.initiated_at),
        category: 'TRANSFER',
        warehouseId: t.from_warehouse_id,
        description: `Transfer ${p?.sku || 'Unknown SKU'}: ${fromCode} to ${toCode} [${t.status}]`,
        quantity: t.quantity,
        valueImpact: null,
      });
    });
    counts.forEach((c) => {
      const p = productById.get(c.product_id);
      events.push({
        id: c.id,
        date: new Date(c.counted_at),
        category: 'COUNT',
        warehouseId: c.warehouse_id,
        description: `Count - ${p?.sku || 'Unknown SKU'} (system ${c.system_quantity_at_count}, counted ${c.counted_quantity}, variance ${c.variance > 0 ? '+' : ''}${c.variance})`,
        quantity: Math.abs(c.variance),
        valueImpact: null,
      });
    });
    return events;
  }, [adjustments, qcHolds, transfers, counts, productById, batchById, warehouseById]);

  const filteredEvents = useMemo(() => {
    let rows = allEvents;
    if (rangeFrom) rows = rows.filter((e) => e.date >= rangeFrom);
    if (rangeTo) rows = rows.filter((e) => e.date <= rangeTo);
    if (warehouseFilter !== 'ALL') rows = rows.filter((e) => e.warehouseId === warehouseFilter);
    return rows;
  }, [allEvents, rangeFrom, rangeTo, warehouseFilter]);

  const chartData = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();
    filteredEvents.forEach((e) => {
      const key = bucketKey(e.date, granularity);
      const row = buckets.get(key) || {};
      row[CATEGORY_LABELS[e.category]] = (row[CATEGORY_LABELS[e.category]] || 0) + 1;
      buckets.set(key, row);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, values]) => ({ key, label: bucketLabel(key, granularity), ...values }));
  }, [filteredEvents, granularity]);

  const warehouseSummary = useMemo(() => {
    return realWarehouses.map((w) => {
      const whEvents = filteredEvents.filter((e) => e.warehouseId === w.id);
      const adj = whEvents.filter((e) => e.category === 'ADJUSTMENT');
      const netValue = adj.reduce((s, e) => s + (e.valueImpact || 0), 0);
      return {
        code: w.code,
        adjustments: adj.length,
        netValue,
        transfers: whEvents.filter((e) => e.category === 'TRANSFER').length,
        qcHolds: whEvents.filter((e) => e.category === 'QC_HOLD').length,
        counts: whEvents.filter((e) => e.category === 'COUNT').length,
      };
    });
  }, [realWarehouses, filteredEvents]);

  const detailRows = useMemo(() => {
    if (!selected) return [];
    return filteredEvents
      .filter((e) => bucketKey(e.date, granularity) === selected.bucket && e.category === selected.category)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((e) => ({
        date: e.date.toLocaleDateString(),
        warehouse: warehouseById.get(e.warehouseId)?.code || 'Unknown',
        description: e.description,
        quantity: e.quantity,
        valueImpact: e.valueImpact,
      }));
  }, [selected, filteredEvents, granularity, warehouseById]);

  const categoryKeys = useMemo(() => Array.from(new Set(filteredEvents.map((e) => CATEGORY_LABELS[e.category]))).sort(), [filteredEvents]);

  return (
    <ProtectedRoute>
      <Head>
        <title>Inventory Trends - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Inventory Trends" />

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
                <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse</label>
                <select value={warehouseFilter} onChange={(e) => { setWarehouseFilter(e.target.value); setSelected(null); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="ALL">All Warehouses</option>
                  {realWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Current snapshot */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Current Inventory Snapshot (live, all warehouses)</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
                <div>
                  <p className="text-xs text-slate-500">On-Hand</p>
                  <p className="text-lg font-semibold text-slate-900">{snapshot.onHand}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Unassigned</p>
                  <p className="text-lg font-semibold text-slate-900">{snapshot.unassigned}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">In Transit</p>
                  <p className="text-lg font-semibold text-slate-900">{snapshot.inTransit}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">On the Water</p>
                  <p className="text-lg font-semibold text-slate-900">{snapshot.onWater}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">QC Hold</p>
                  <p className="text-lg font-semibold text-slate-900">{snapshot.qcHold}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total in System</p>
                  <p className="text-lg font-semibold text-slate-900">{snapshot.total}</p>
                </div>
              </div>
            )}
          </div>

          {/* Warehouse activity summary */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Warehouse Activity Summary — {DATE_PRESET_LABELS[datePreset]}</h2>
            {warehouseSummary.length === 0 ? (
              <p className="text-sm text-slate-500">No warehouses.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">Warehouse</th>
                    <th className="py-1.5 pr-4">Adjustments</th>
                    <th className="py-1.5 pr-4">Net Loss/Gain $</th>
                    <th className="py-1.5 pr-4">Transfers</th>
                    <th className="py-1.5 pr-4">QC Holds</th>
                    <th className="py-1.5 pr-4">Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {warehouseSummary.map((w) => (
                    <tr key={w.code}>
                      <td className="py-1 pr-4 font-medium">{w.code}</td>
                      <td className="py-1 pr-4">{w.adjustments}</td>
                      <td className={`py-1 pr-4 ${w.netValue < 0 ? 'text-red-600' : w.netValue > 0 ? 'text-green-600' : ''}`}>{money(w.netValue)}</td>
                      <td className="py-1 pr-4">{w.transfers}</td>
                      <td className="py-1 pr-4">{w.qcHolds}</td>
                      <td className="py-1 pr-4">{w.counts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Activity chart */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Inventory Activity Over Time</h2>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No activity in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {(['ADJUSTMENT', 'TRANSFER', 'QC_HOLD', 'COUNT'] as ActivityEvent['category'][])
                    .filter((c) => categoryKeys.includes(CATEGORY_LABELS[c]))
                    .map((c) => (
                      <Bar
                        key={c}
                        dataKey={CATEGORY_LABELS[c]}
                        stackId="a"
                        fill={CATEGORY_COLORS[c]}
                        cursor="pointer"
                        onClick={(data) => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const payload = (data as any)?.payload as { key?: string } | undefined;
                          if (payload?.key) setSelected({ bucket: payload.key, category: c });
                        }}
                      />
                    ))}
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-slate-400 mt-2">Click a bar segment to see that category&apos;s events for that period.</p>
          </div>

          {selected && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                  Detail — {CATEGORY_LABELS[selected.category]}, {bucketLabel(selected.bucket, granularity)} ({detailRows.length} event{detailRows.length === 1 ? '' : 's'})
                </h2>
                <button onClick={() => setSelected(null)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
              </div>
              {detailRows.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing here.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 pr-4">Date</th>
                      <th className="py-1.5 pr-4">Warehouse</th>
                      <th className="py-1.5 pr-4">Description</th>
                      <th className="py-1.5 pr-4">Qty</th>
                      <th className="py-1.5 pr-4">Value Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-4">{r.date}</td>
                        <td className="py-1 pr-4">{r.warehouse}</td>
                        <td className="py-1 pr-4">{r.description}</td>
                        <td className="py-1 pr-4">{r.quantity}</td>
                        <td className={`py-1 pr-4 ${r.valueImpact == null ? '' : r.valueImpact < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {r.valueImpact == null ? '—' : money(r.valueImpact)}
                        </td>
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
