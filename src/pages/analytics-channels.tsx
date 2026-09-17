'use client';

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';
import { Granularity, DatePreset, DATE_PRESET_LABELS, presetRange, bucketKey, bucketLabel, startOfDay, endOfDay } from '@/lib/dateBuckets';

interface Order {
  id: string;
  order_number: string;
  channel: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface SyncLog {
  id: string;
  channel: string;
  sync_type: string;
  status: string;
  records_synced: number | null;
  records_failed: number | null;
  error_message: string | null;
  started_at: string;
}

interface ChannelInfo {
  channel_name: string;
  is_active: boolean;
  last_sync_at: string | null;
  sync_frequency_minutes: number | null;
}

type Metric = 'REVENUE' | 'ORDERS';

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart',
  AMAZON3P: 'Amazon',
  SHOPIFY: 'Shopify',
};
const CHANNEL_COLORS: Record<string, string> = {
  Wayfair: '#dc2626',
  Walmart: '#d97706',
  Amazon: '#2563eb',
  Shopify: '#16a34a',
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function AnalyticsChannels() {
  const { tenantId } = useAuthStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [granularity, setGranularity] = useState<Granularity>('DAILY');
  const [datePreset, setDatePreset] = useState<DatePreset>('THIS_MONTH');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [metric, setMetric] = useState<Metric>('REVENUE');
  const [selected, setSelected] = useState<{ bucket: string; channel: string } | null>(null);

  const fetchAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');

    const [{ data: ordersData }, { data: syncData }, { data: channelsData }] = await Promise.all([
      supabase.from('orders').select('id, order_number, channel, status, total_amount, created_at').eq('tenant_id', tenantId),
      supabase.from('sync_logs').select('id, channel, sync_type, status, records_synced, records_failed, error_message, started_at').eq('tenant_id', tenantId),
      supabase.from('channels').select('channel_name, is_active, last_sync_at, sync_frequency_minutes').eq('tenant_id', tenantId),
    ]);

    setOrders((ordersData as Order[]) || []);
    setSyncLogs((syncData as SyncLog[]) || []);
    setChannels((channelsData as ChannelInfo[]) || []);
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

  const filteredOrders = useMemo(() => {
    let rows = orders.filter((o) => o.status !== 'CANCELLED');
    if (rangeFrom) rows = rows.filter((o) => new Date(o.created_at) >= rangeFrom);
    if (rangeTo) rows = rows.filter((o) => new Date(o.created_at) <= rangeTo);
    return rows;
  }, [orders, rangeFrom, rangeTo]);

  const filteredSyncLogs = useMemo(() => {
    let rows = syncLogs;
    if (rangeFrom) rows = rows.filter((s) => new Date(s.started_at) >= rangeFrom);
    if (rangeTo) rows = rows.filter((s) => new Date(s.started_at) <= rangeTo);
    return rows;
  }, [syncLogs, rangeFrom, rangeTo]);

  const channelKeys = useMemo(() => Array.from(new Set(filteredOrders.map((o) => CHANNEL_LABELS[o.channel] || o.channel))).sort(), [filteredOrders]);

  const performanceChartData = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>();
    filteredOrders.forEach((o) => {
      const key = bucketKey(new Date(o.created_at), granularity);
      const ch = CHANNEL_LABELS[o.channel] || o.channel;
      const row = buckets.get(key) || {};
      row[ch] = (row[ch] || 0) + (metric === 'REVENUE' ? Number(o.total_amount || 0) : 1);
      buckets.set(key, row);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, values]) => ({ key, label: bucketLabel(key, granularity), ...values }));
  }, [filteredOrders, granularity, metric]);

  const syncChartData = useMemo(() => {
    const buckets = new Map<string, { success: number; failed: number }>();
    filteredSyncLogs.forEach((s) => {
      const key = bucketKey(new Date(s.started_at), granularity);
      const row = buckets.get(key) || { success: 0, failed: 0 };
      if (s.status === 'success' || s.status === 'SUCCESS') row.success += 1;
      else row.failed += 1;
      buckets.set(key, row);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, values]) => ({ key, label: bucketLabel(key, granularity), ...values }));
  }, [filteredSyncLogs, granularity]);

  const channelSummary = useMemo(() => {
    return channelKeys.map((chLabel) => {
      const chOrders = filteredOrders.filter((o) => (CHANNEL_LABELS[o.channel] || o.channel) === chLabel);
      const revenue = chOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const rawChannel = Object.keys(CHANNEL_LABELS).find((k) => CHANNEL_LABELS[k] === chLabel) || chLabel;
      const info = channels.find((c) => c.channel_name === rawChannel);
      const chSyncs = filteredSyncLogs.filter((s) => s.channel === rawChannel);
      const failedSyncs = chSyncs.filter((s) => s.status !== 'success' && s.status !== 'SUCCESS').length;
      return {
        channel: chLabel,
        orderCount: chOrders.length,
        revenue,
        isActive: info?.is_active ?? null,
        lastSync: info?.last_sync_at || null,
        syncRuns: chSyncs.length,
        failedSyncs,
      };
    });
  }, [channelKeys, filteredOrders, filteredSyncLogs, channels]);

  const detailRows = useMemo(() => {
    if (!selected) return [];
    return filteredOrders
      .filter((o) => bucketKey(new Date(o.created_at), granularity) === selected.bucket && (CHANNEL_LABELS[o.channel] || o.channel) === selected.channel)
      .map((o) => ({ orderNumber: o.order_number, date: new Date(o.created_at).toLocaleDateString(), status: o.status, value: Number(o.total_amount || 0) }));
  }, [selected, filteredOrders, granularity]);

  return (
    <ProtectedRoute>
      <Head>
        <title>Channel Performance - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Channel Performance" />

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
                  {(['REVENUE', 'ORDERS'] as Metric[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMetric(m); setSelected(null); }}
                      className={`px-3 py-1.5 ${metric === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {m === 'REVENUE' ? 'Revenue $' : 'Order Count'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Channel summary */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Channel Summary</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : channelSummary.length === 0 ? (
              <p className="text-sm text-slate-500">No orders in this range.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 pr-4">Channel</th>
                    <th className="py-1.5 pr-4">Orders</th>
                    <th className="py-1.5 pr-4">Revenue</th>
                    <th className="py-1.5 pr-4">Status</th>
                    <th className="py-1.5 pr-4">Last Sync</th>
                    <th className="py-1.5 pr-4">Sync Runs (range)</th>
                    <th className="py-1.5 pr-4">Failed Syncs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {channelSummary.map((c) => (
                    <tr key={c.channel}>
                      <td className="py-1 pr-4 font-medium">{c.channel}</td>
                      <td className="py-1 pr-4">{c.orderCount}</td>
                      <td className="py-1 pr-4">{money(c.revenue)}</td>
                      <td className="py-1 pr-4">
                        {c.isActive == null ? (
                          '—'
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                            {c.isActive ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-4">{c.lastSync ? new Date(c.lastSync).toLocaleString() : 'Never'}</td>
                      <td className="py-1 pr-4">{c.syncRuns}</td>
                      <td className={`py-1 pr-4 ${c.failedSyncs > 0 ? 'text-red-600 font-medium' : ''}`}>{c.failedSyncs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Performance chart */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">
              {metric === 'REVENUE' ? 'Revenue' : 'Orders'} by Channel Over Time
            </h2>
            {performanceChartData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No orders in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={performanceChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value, name) => [metric === 'REVENUE' ? money(Number(value)) : value, name]} />
                  <Legend />
                  {channelKeys.map((ch) => (
                    <Bar
                      key={ch}
                      dataKey={ch}
                      stackId="a"
                      fill={CHANNEL_COLORS[ch] || '#64748b'}
                      cursor="pointer"
                      onClick={(data) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const payload = (data as any)?.payload as { key?: string } | undefined;
                        if (payload?.key) setSelected({ bucket: payload.key, channel: ch });
                      }}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-slate-400 mt-2">Click a bar segment to see that channel&apos;s orders for that period.</p>
          </div>

          {selected && (
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                  Detail — {selected.channel}, {bucketLabel(selected.bucket, granularity)} ({detailRows.length} order{detailRows.length === 1 ? '' : 's'})
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
                      <th className="py-1.5 pr-4">Status</th>
                      <th className="py-1.5 pr-4">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailRows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-4 font-medium">{r.orderNumber}</td>
                        <td className="py-1 pr-4">{r.date}</td>
                        <td className="py-1 pr-4">{r.status}</td>
                        <td className="py-1 pr-4">{money(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Sync health chart */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-3">Sync Health Over Time</h2>
            {syncChartData.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No sync runs in this range.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={syncChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="success" stackId="s" fill="#16a34a" name="Success" />
                  <Bar dataKey="failed" stackId="s" fill="#dc2626" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
