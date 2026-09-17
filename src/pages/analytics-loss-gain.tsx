'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';
import { Granularity, DatePreset, DATE_PRESET_LABELS, presetRange, bucketKey, bucketLabel, startOfDay, endOfDay } from '@/lib/dateBuckets';

interface Product {
  id: string;
  sku: string;
  title: string;
}
interface Warehouse {
  id: string;
  code: string;
  name: string;
}
interface Adjustment {
  id: string;
  product_id: string;
  warehouse_id: string;
  adjustment_type: 'LOSS' | 'GAIN';
  reason_code: string;
  quantity: number;
  total_value: number | null;
  status: string;
  source: string;
  notes: string | null;
  approved_at: string | null;
}

const REASON_LABELS: Record<string, string> = {
  DAMAGED: 'Damaged / Broken',
  MISSING: 'Missing / Lost',
  RENDERED_FOR_PARTS: 'Rendered for Parts',
  COUNT_CORRECTION: 'Count Correction',
  FOUND: 'Found / Recovered',
  QC_FAILED_WRITEOFF: 'QC Failed (Write-Off)',
  OTHER: 'Other',
};

type Metric = 'VALUE' | 'UNITS';

const money = (n: number) => `$${n.toFixed(2)}`;

export default function AnalyticsLossGain() {
  const { tenantId } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [granularity, setGranularity] = useState<Granularity>('DAILY');
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [metric, setMetric] = useState<Metric>('VALUE');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [selected, setSelected] = useState<{ bucket: string; type: 'LOSS' | 'GAIN' } | null>(null);

  const fetchAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');

    const [{ data: productsData }, { data: warehousesData }, { data: adjData }] = await Promise.all([
      supabase.from('products').select('id, sku, title').eq('tenant_id', tenantId),
      supabase.from('warehouses').select('id, code, name').eq('tenant_id', tenantId),
      supabase
        .from('inventory_adjustments')
        .select('id, product_id, warehouse_id, adjustment_type, reason_code, quantity, total_value, status, source, notes, approved_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'APPROVED'),
    ]);

    setProducts((productsData as Product[]) || []);
    setWarehouses((warehousesData as Warehouse[]) || []);
    setAdjustments((adjData as Adjustment[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const warehouseById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const { from: rangeFrom, to: rangeTo } = useMemo(() => {
    if (datePreset === 'CUSTOM') {
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? endOfDay(new Date(customTo)) : null,
      };
    }
    return presetRange(datePreset);
  }, [datePreset, customFrom, customTo]);

  const filtered = useMemo(() => {
    let rows = adjustments.filter((a) => a.approved_at);
    if (rangeFrom) rows = rows.filter((a) => new Date(a.approved_at as string) >= rangeFrom);
    if (rangeTo) rows = rows.filter((a) => new Date(a.approved_at as string) <= rangeTo);
    if (warehouseFilter !== 'ALL') rows = rows.filter((a) => a.warehouse_id === warehouseFilter);
    return rows;
  }, [adjustments, rangeFrom, rangeTo, warehouseFilter]);

  const summary = useMemo(() => {
    const lossRows = filtered.filter((a) => a.adjustment_type === 'LOSS');
    const gainRows = filtered.filter((a) => a.adjustment_type === 'GAIN');
    const lossValue = lossRows.reduce((s, a) => s + Number(a.total_value || 0), 0);
    const gainValue = gainRows.reduce((s, a) => s + Number(a.total_value || 0), 0);
    const lossUnits = lossRows.reduce((s, a) => s + a.quantity, 0);
    const gainUnits = gainRows.reduce((s, a) => s + a.quantity, 0);
    return { lossValue, gainValue, netValue: gainValue - lossValue, lossUnits, gainUnits };
  }, [filtered]);

  const chartData = useMemo(() => {
    const buckets = new Map<string, { loss: number; gain: number }>();
    filtered.forEach((a) => {
      const key = bucketKey(new Date(a.approved_at as string), granularity);
      const row = buckets.get(key) || { loss: 0, gain: 0 };
      const amount = metric === 'VALUE' ? Number(a.total_value || 0) : a.quantity;
      if (a.adjustment_type === 'LOSS') row.loss += amount;
      else row.gain += amount;
      buckets.set(key, row);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, values]) => ({ key, label: bucketLabel(key, granularity), 'Loss': values.loss, 'Gain': values.gain }));
  }, [filtered, granularity, metric]);

  const byWarehouse = useMemo(() => {
    const map = new Map<string, { warehouseId: string; lossValue: number; gainValue: number; lossUnits: number; gainUnits: number }>();
    filtered.forEach((a) => {
      const key = a.warehouse_id;
      const entry = map.get(key) || { warehouseId: key, lossValue: 0, gainValue: 0, lossUnits: 0, gainUnits: 0 };
      if (a.adjustment_type === 'LOSS') {
        entry.lossValue += Number(a.total_value || 0);
        entry.lossUnits += a.quantity;
      } else {
        entry.gainValue += Number(a.total_value || 0);
        entry.gainUnits += a.quantity;
      }
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.lossValue + b.gainValue - (a.lossValue + a.gainValue));
  }, [filtered]);

  const byReason = useMemo(() => {
    const map = new Map<string, { reason: string; type: 'LOSS' | 'GAIN'; value: number; units: number; count: number }>();
    filtered.forEach((a) => {
      const key = `${a.reason_code}::${a.adjustment_type}`;
      const entry = map.get(key) || { reason: a.reason_code, type: a.adjustment_type, value: 0, units: 0, count: 0 };
      entry.value += Number(a.total_value || 0);
      entry.units += a.quantity;
      entry.count += 1;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const detailRows = useMemo(() => {
    if (!selected) return [];
    return filtered
      .filter((a) => bucketKey(new Date(a.approved_at as string), granularity) === selected.bucket && a.adjustment_type === selected.type)
      .sort((a, b) => new Date(a.approved_at as string).getTime() - new Date(b.approved_at as string).getTime())
      .map((a) => ({
        date: new Date(a.approved_at as string).toLocaleDateString(),
        sku: productById.get(a.product_id)?.sku || '—',
        title: productById.get(a.product_id)?.title || '—',
        warehouse: warehouseById.get(a.warehouse_id)?.code || '—',
        reason: REASON_LABELS[a.reason_code] || a.reason_code,
        quantity: a.quantity,
        value: Number(a.total_value || 0),
      }));
  }, [selected, filtered, granularity, productById, warehouseById]);

  return (
    <ProtectedRoute>
      <Head>
        <title>Loss / Gain Trends - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Loss / Gain Trends" />

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
                  {(['VALUE', 'UNITS'] as Metric[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMetric(m); setSelected(null); }}
                      className={`px-3 py-1.5 ${metric === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {m === 'VALUE' ? 'Value $' : 'Units'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse</label>
                <select value={warehouseFilter} onChange={(e) => { setWarehouseFilter(e.target.value); setSelected(null); }} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="ALL">All warehouses</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Company-wide summary */}
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
                  Company-Wide Summary — {DATE_PRESET_LABELS[datePreset]} ({filtered.length} adjustment{filtered.length === 1 ? '' : 's'})
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-red-50 rounded p-2">
                    <div className="text-xs text-slate-500 uppercase">Total Loss</div>
                    <div className="text-lg font-semibold text-red-600">{money(summary.lossValue)}</div>
                    <div className="text-xs text-slate-400">{summary.lossUnits} units</div>
                  </div>
                  <div className="bg-green-50 rounded p-2">
                    <div className="text-xs text-slate-500 uppercase">Total Gain</div>
                    <div className="text-lg font-semibold text-green-700">{money(summary.gainValue)}</div>
                    <div className="text-xs text-slate-400">{summary.gainUnits} units</div>
                  </div>
                  <div className="bg-slate-50 rounded p-2">
                    <div className="text-xs text-slate-500 uppercase">Net</div>
                    <div className={`text-lg font-semibold ${summary.netValue >= 0 ? 'text-green-700' : 'text-red-600'}`}>{money(summary.netValue)}</div>
                  </div>
                </div>
              </div>

              {/* Trend chart */}
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Loss vs Gain Over Time — {metric === 'VALUE' ? 'Value $' : 'Units'}</h2>
                {chartData.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">No adjustments in this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value, name) => [metric === 'VALUE' ? money(Number(value)) : value, name]} />
                      <Legend />
                      <Bar
                        dataKey="Loss"
                        stackId="a"
                        fill="#dc2626"
                        cursor="pointer"
                        onClick={(data) => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const payload = (data as any)?.payload as { key?: string } | undefined;
                          if (payload?.key) setSelected({ bucket: payload.key, type: 'LOSS' });
                        }}
                      />
                      <Bar
                        dataKey="Gain"
                        stackId="a"
                        fill="#16a34a"
                        cursor="pointer"
                        onClick={(data) => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const payload = (data as any)?.payload as { key?: string } | undefined;
                          if (payload?.key) setSelected({ bucket: payload.key, type: 'GAIN' });
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <p className="text-xs text-slate-400 mt-2">Click a bar segment to see that period&apos;s loss or gain line items.</p>
              </div>

              {selected && (
                <div className="bg-white rounded-lg shadow p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                      Detail — {selected.type}, {bucketLabel(selected.bucket, granularity)} ({detailRows.length} line{detailRows.length === 1 ? '' : 's'})
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
                          <th className="py-1.5 pr-4">SKU</th>
                          <th className="py-1.5 pr-4">Title</th>
                          <th className="py-1.5 pr-4">Warehouse</th>
                          <th className="py-1.5 pr-4">Reason</th>
                          <th className="py-1.5 pr-4">Qty</th>
                          <th className="py-1.5 pr-4">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailRows.map((r, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-4">{r.date}</td>
                            <td className="py-1 pr-4">{r.sku}</td>
                            <td className="py-1 pr-4">{r.title}</td>
                            <td className="py-1 pr-4">{r.warehouse}</td>
                            <td className="py-1 pr-4">{r.reason}</td>
                            <td className="py-1 pr-4">{r.quantity}</td>
                            <td className={`py-1 pr-4 ${selected.type === 'LOSS' ? 'text-red-600' : 'text-green-700'}`}>{money(r.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* By warehouse */}
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">By Warehouse</h2>
                {byWarehouse.length === 0 ? (
                  <p className="text-sm text-slate-500">No adjustments in this range.</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 pr-4">Warehouse</th>
                        <th className="py-1.5 pr-4">Loss $</th>
                        <th className="py-1.5 pr-4">Loss Units</th>
                        <th className="py-1.5 pr-4">Gain $</th>
                        <th className="py-1.5 pr-4">Gain Units</th>
                        <th className="py-1.5 pr-4">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byWarehouse.map((w) => (
                        <tr key={w.warehouseId}>
                          <td className="py-1 pr-4 font-medium">{warehouseById.get(w.warehouseId)?.name || '—'}</td>
                          <td className="py-1 pr-4 text-red-600">{money(w.lossValue)}</td>
                          <td className="py-1 pr-4">{w.lossUnits}</td>
                          <td className="py-1 pr-4 text-green-700">{money(w.gainValue)}</td>
                          <td className="py-1 pr-4">{w.gainUnits}</td>
                          <td className={`py-1 pr-4 font-medium ${w.gainValue - w.lossValue >= 0 ? 'text-green-700' : 'text-red-600'}`}>{money(w.gainValue - w.lossValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* By reason */}
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">By Reason</h2>
                {byReason.length === 0 ? (
                  <p className="text-sm text-slate-500">No adjustments in this range.</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 pr-4">Reason</th>
                        <th className="py-1.5 pr-4">Type</th>
                        <th className="py-1.5 pr-4">Value</th>
                        <th className="py-1.5 pr-4">Units</th>
                        <th className="py-1.5 pr-4">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {byReason.map((r) => (
                        <tr key={`${r.reason}-${r.type}`}>
                          <td className="py-1 pr-4 font-medium">{REASON_LABELS[r.reason] || r.reason}</td>
                          <td className={`py-1 pr-4 ${r.type === 'LOSS' ? 'text-red-600' : 'text-green-700'}`}>{r.type}</td>
                          <td className="py-1 pr-4">{money(r.value)}</td>
                          <td className="py-1 pr-4">{r.units}</td>
                          <td className="py-1 pr-4">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
