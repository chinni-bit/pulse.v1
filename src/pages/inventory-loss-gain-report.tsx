'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

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

type DatePreset = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'ALL_TIME' | 'CUSTOM';

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  TODAY: 'Today',
  THIS_WEEK: 'This Week',
  THIS_MONTH: 'This Month',
  THIS_YEAR: 'This Year',
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

const money = (n: number) => `$${n.toFixed(2)}`;

export default function InventoryLossGainReport() {
  const { tenantId } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'LOSS' | 'GAIN'>('ALL');

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
        .eq('status', 'APPROVED')
        .order('approved_at', { ascending: false }),
    ]);

    setProducts(productsData || []);
    setWarehouses(warehousesData || []);
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
    let rows = adjustments;
    if (rangeFrom) rows = rows.filter((a) => a.approved_at && new Date(a.approved_at) >= rangeFrom);
    if (rangeTo) rows = rows.filter((a) => a.approved_at && new Date(a.approved_at) <= rangeTo);
    if (warehouseFilter !== 'ALL') rows = rows.filter((a) => a.warehouse_id === warehouseFilter);
    if (reasonFilter !== 'ALL') rows = rows.filter((a) => a.reason_code === reasonFilter);
    if (typeFilter !== 'ALL') rows = rows.filter((a) => a.adjustment_type === typeFilter);
    return rows;
  }, [adjustments, rangeFrom, rangeTo, warehouseFilter, reasonFilter, typeFilter]);

  const summary = useMemo(() => {
    const lossRows = filtered.filter((a) => a.adjustment_type === 'LOSS');
    const gainRows = filtered.filter((a) => a.adjustment_type === 'GAIN');
    const lossValue = lossRows.reduce((s, a) => s + Number(a.total_value || 0), 0);
    const gainValue = gainRows.reduce((s, a) => s + Number(a.total_value || 0), 0);
    const lossUnits = lossRows.reduce((s, a) => s + a.quantity, 0);
    const gainUnits = gainRows.reduce((s, a) => s + a.quantity, 0);
    return { lossValue, gainValue, netValue: gainValue - lossValue, lossUnits, gainUnits };
  }, [filtered]);

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

  const reasonOptions = useMemo(() => Array.from(new Set(adjustments.map((a) => a.reason_code))).sort(), [adjustments]);

  return (
    <ProtectedRoute>
      <Head>
        <title>Loss / Gain Report - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Loss / Gain Report" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date Range</label>
                <select value={datePreset} onChange={(e) => setDatePreset(e.target.value as DatePreset)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse</label>
                <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="ALL">All warehouses</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
                <select value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="ALL">All reasons</option>
                  {reasonOptions.map((r) => (
                    <option key={r} value={r}>
                      {REASON_LABELS[r] || r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} className="px-2 py-1.5 text-sm border border-slate-300 rounded">
                  <option value="ALL">Loss + Gain</option>
                  <option value="LOSS">Loss only</option>
                  <option value="GAIN">Gain only</option>
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
                  Company-Wide Summary ({filtered.length} adjustment{filtered.length === 1 ? '' : 's'})
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

              {/* Detail list */}
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Detail</h2>
                {filtered.length === 0 ? (
                  <p className="text-sm text-slate-500">No adjustments in this range.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 border-b border-slate-200">
                          <th className="py-1.5 pr-4">Date</th>
                          <th className="py-1.5 pr-4">Type</th>
                          <th className="py-1.5 pr-4">SKU</th>
                          <th className="py-1.5 pr-4">Title</th>
                          <th className="py-1.5 pr-4">Warehouse</th>
                          <th className="py-1.5 pr-4">Reason</th>
                          <th className="py-1.5 pr-4">Qty</th>
                          <th className="py-1.5 pr-4">Value</th>
                          <th className="py-1.5 pr-4">Source</th>
                          <th className="py-1.5 pr-4">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.map((a) => (
                          <tr key={a.id}>
                            <td className="py-1 pr-4 whitespace-nowrap">{a.approved_at ? new Date(a.approved_at).toLocaleString() : '—'}</td>
                            <td className={`py-1 pr-4 font-medium ${a.adjustment_type === 'LOSS' ? 'text-red-600' : 'text-green-700'}`}>{a.adjustment_type}</td>
                            <td className="py-1 pr-4">{productById.get(a.product_id)?.sku || '—'}</td>
                            <td className="py-1 pr-4">{productById.get(a.product_id)?.title || '—'}</td>
                            <td className="py-1 pr-4">{warehouseById.get(a.warehouse_id)?.name || '—'}</td>
                            <td className="py-1 pr-4">{REASON_LABELS[a.reason_code] || a.reason_code}</td>
                            <td className="py-1 pr-4">{a.quantity}</td>
                            <td className="py-1 pr-4">{a.total_value != null ? money(Number(a.total_value)) : '—'}</td>
                            <td className="py-1 pr-4">{a.source}</td>
                            <td className="py-1 pr-4 text-slate-500">{a.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
