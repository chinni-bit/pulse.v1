'use client';

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppHeader } from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

interface Channel {
  id: string;
  channel_name: string;
  is_active: boolean;
  sync_frequency_minutes: number;
  last_sync_at: string | null;
}

interface SyncLog {
  id: string;
  channel: string;
  sync_type: string;
  status: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  synced_order_ids: string[];
  pushed_items: { sku: string; quantity: number; supplierId?: number }[];
}

interface DrilldownOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
}

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart Marketplace (WM3P)',
  AMAZON3P: 'Amazon (AMAZON3P)',
};

const TESTABLE: Record<string, string> = {
  WAYFAIR: '/api/channels/test-wayfair',
  WM3P: '/api/channels/test-walmart',
};

const SYNCABLE: Record<string, string> = {
  WAYFAIR: '/api/channels/sync-wayfair-orders',
  WM3P: '/api/channels/sync-walmart-orders',
};

const PUSHABLE: Record<string, string> = {
  WAYFAIR: '/api/channels/push-wayfair-inventory',
  WM3P: '/api/channels/push-walmart-inventory',
};

export default function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, string>>({});
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<Record<string, string>>({});
  const [intervalDrafts, setIntervalDrafts] = useState<Record<string, string>>({});
  const [intervalSaving, setIntervalSaving] = useState<string | null>(null);

  const [drilldownLog, setDrilldownLog] = useState<SyncLog | null>(null);
  const [drilldownOrders, setDrilldownOrders] = useState<DrilldownOrder[] | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);

    const { data: channelsData } = await supabase
      .from('channels')
      .select('id, channel_name, is_active, sync_frequency_minutes, last_sync_at')
      .order('channel_name', { ascending: true });

    const { data: logsData } = await supabase
      .from('sync_logs')
      .select('id, channel, sync_type, status, error_message, started_at, completed_at, synced_order_ids, pushed_items')
      .order('started_at', { ascending: false })
      .limit(20);

    setChannels(channelsData || []);
    setLogs(logsData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const saveInterval = async (channelId: string, channelName: string) => {
    const raw = intervalDrafts[channelName];
    const minutes = Number(raw);
    if (!raw || !Number.isFinite(minutes) || minutes < 1) return;

    setIntervalSaving(channelName);
    const { error } = await supabase
      .from('channels')
      .update({ sync_frequency_minutes: Math.round(minutes) })
      .eq('id', channelId);
    setIntervalSaving(null);

    if (!error) {
      setIntervalDrafts((prev) => ({ ...prev, [channelName]: '' }));
      fetchData();
    }
  };

  const openDrilldown = async (log: SyncLog) => {
    setDrilldownLog(log);
    setDrilldownOrders(null);

    if (log.sync_type === 'pull_orders' && log.synced_order_ids?.length) {
      setDrilldownLoading(true);
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, created_at')
        .in('id', log.synced_order_ids);
      setDrilldownOrders(data || []);
      setDrilldownLoading(false);
    }
  };

  const testConnection = async (channelName: string) => {
    const endpoint = TESTABLE[channelName];
    if (!endpoint) return;

    setTesting(channelName);
    setTestResult((prev) => ({ ...prev, [channelName]: '' }));

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setTestResult((prev) => ({ ...prev, [channelName]: 'Session expired - log in again' }));
      setTesting(null);
      return;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await res.json();

    setTestResult((prev) => ({
      ...prev,
      [channelName]: res.ok ? 'Connected successfully' : `Failed: ${result.error}`,
    }));
    setTesting(null);
    fetchData();
  };

  const syncOrders = async (channelName: string) => {
    const endpoint = SYNCABLE[channelName];
    if (!endpoint) return;

    setSyncing(channelName);
    setSyncResult((prev) => ({ ...prev, [channelName]: '' }));

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSyncResult((prev) => ({ ...prev, [channelName]: 'Session expired - log in again' }));
      setSyncing(null);
      return;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await res.json();

    setSyncResult((prev) => ({
      ...prev,
      [channelName]: res.ok
        ? `${result.ordersCreated} new order(s), ${result.ordersUnchanged} unchanged, ${result.ordersUpdatedOnResync} updated (e.g. cancelled) - ${result.lineItemsMatched} line item(s) matched (${result.lineItemsCancelled} cancelled), ${result.lineItemsUnmatched} unmatched`
        : `Failed: ${result.error}`,
    }));
    setSyncing(null);
    fetchData();
  };

  const pushInventory = async (channelName: string) => {
    const endpoint = PUSHABLE[channelName];
    if (!endpoint) return;

    setPushing(channelName);
    setPushResult((prev) => ({ ...prev, [channelName]: '' }));

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setPushResult((prev) => ({ ...prev, [channelName]: 'Session expired - log in again' }));
      setPushing(null);
      return;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await res.json();

    setPushResult((prev) => ({
      ...prev,
      [channelName]: res.ok
        ? `${result.productCount} product(s) (${result.overrideCount} with a SKU override), ${result.itemCount} pushed, ${result.errorCount} error(s)`
        : `Failed: ${result.error}`,
    }));
    setPushing(null);
    fetchData();
  };

  return (
    <ProtectedRoute>
      <Head>
        <title>Channels - Nestora Pulse</title>
      </Head>

      <main className="min-h-screen bg-slate-50">
        <AppHeader title="Channels" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            Wayfair and Walmart (WM3P) can both pull orders and push inventory - Amazon (AMAZON3P)
            isn&apos;t connected yet. By default every product uses its own SKU on both connected
            channels (that&apos;s how their APIs are designed to work) - set a channel-specific SKU
            override on a product in{' '}
            <Link href="/products" className="underline">Products</Link> only if a channel
            actually lists it under a different code. A fully cancelled order is marked Cancelled
            and excluded from its own total; order line items only link to a local product when
            the SKU matches exactly - sandbox test SKUs mostly won&apos;t match real products yet,
            expected, not a bug. Wayfair reports inventory per warehouse (they price/source by
            shipping cost from each one) - set a Wayfair Supplier ID on a warehouse in{' '}
            <Link href="/warehouses" className="underline">Warehouses</Link> to include it;
            warehouses without one are skipped. Each channel below has its own auto-sync interval -
            a scheduled job pulls orders automatically on that cadence (see the note under the
            interval field for how often this actually runs).
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {channels.map((channel) => {
                const connected = Boolean(TESTABLE[channel.channel_name]);
                return (
                <div key={channel.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {CHANNEL_LABELS[channel.channel_name] || channel.channel_name}
                    </h2>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        connected && channel.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {connected ? (channel.is_active ? 'Active' : 'Inactive') : 'Not Connected'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-2">
                    Last sync: {channel.last_sync_at ? new Date(channel.last_sync_at).toLocaleString() : 'Never'}
                  </p>

                  {connected && (
                    <div className="flex items-center gap-2 mb-4">
                      <label className="text-xs text-slate-500">Auto-sync every</label>
                      <input
                        type="number"
                        min="1"
                        value={intervalDrafts[channel.channel_name] ?? String(channel.sync_frequency_minutes)}
                        onChange={(e) =>
                          setIntervalDrafts((prev) => ({ ...prev, [channel.channel_name]: e.target.value }))
                        }
                        disabled={intervalSaving === channel.channel_name}
                        className="w-16 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50"
                      />
                      <span className="text-xs text-slate-500">min</span>
                      <button
                        onClick={() => saveInterval(channel.id, channel.channel_name)}
                        disabled={intervalSaving === channel.channel_name}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        {intervalSaving === channel.channel_name ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}

                  {TESTABLE[channel.channel_name] ? (
                    <>
                      <div className="flex gap-2">
                        <button
                          onClick={() => testConnection(channel.channel_name)}
                          disabled={testing === channel.channel_name}
                          className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400"
                        >
                          {testing === channel.channel_name ? 'Testing...' : 'Test Connection'}
                        </button>
                        {SYNCABLE[channel.channel_name] && (
                          <button
                            onClick={() => syncOrders(channel.channel_name)}
                            disabled={syncing === channel.channel_name}
                            className="px-3 py-1.5 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:bg-slate-400"
                          >
                            {syncing === channel.channel_name ? 'Pulling...' : 'Pull Orders'}
                          </button>
                        )}
                        {PUSHABLE[channel.channel_name] && (
                          <button
                            onClick={() => pushInventory(channel.channel_name)}
                            disabled={pushing === channel.channel_name}
                            className="px-3 py-1.5 bg-amber-700 text-white text-sm font-medium rounded-lg hover:bg-amber-800 disabled:bg-slate-400"
                          >
                            {pushing === channel.channel_name ? 'Pushing...' : 'Push Inventory'}
                          </button>
                        )}
                      </div>
                      {testResult[channel.channel_name] && (
                        <p
                          className={`text-sm mt-2 ${
                            testResult[channel.channel_name].startsWith('Connected')
                              ? 'text-green-700'
                              : 'text-red-700'
                          }`}
                        >
                          {testResult[channel.channel_name]}
                        </p>
                      )}
                      {syncResult[channel.channel_name] && (
                        <p
                          className={`text-sm mt-2 ${
                            syncResult[channel.channel_name].startsWith('Failed')
                              ? 'text-red-700'
                              : 'text-green-700'
                          }`}
                        >
                          {syncResult[channel.channel_name]}
                        </p>
                      )}
                      {pushResult[channel.channel_name] && (
                        <p
                          className={`text-sm mt-2 ${
                            pushResult[channel.channel_name].startsWith('Failed')
                              ? 'text-red-700'
                              : 'text-green-700'
                          }`}
                        >
                          {pushResult[channel.channel_name]}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">No API credentials configured yet</p>
                  )}
                </div>
                );
              })}
            </div>
          )}

          <h2 className="text-lg font-semibold text-slate-900 mb-3">Recent Sync Activity</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {logs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No sync activity yet</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Channel</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">When</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {logs.map((log) => {
                    const hasDrilldown =
                      (log.sync_type === 'pull_orders' && log.synced_order_ids?.length > 0) ||
                      (log.sync_type === 'push_inventory' && log.pushed_items?.length > 0);
                    return (
                      <tr
                        key={log.id}
                        className={`hover:bg-slate-50 ${hasDrilldown ? 'cursor-pointer' : ''}`}
                        onClick={() => hasDrilldown && openDrilldown(log)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                          {CHANNEL_LABELS[log.channel] || log.channel}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{log.sync_type}</td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              log.status === 'success'
                                ? 'bg-green-100 text-green-800'
                                : log.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {log.started_at ? new Date(log.started_at).toLocaleString() : '—'}
                        </td>
                        <td
                          className={`px-6 py-4 text-sm ${
                            log.status === 'failed' ? 'text-red-600' : 'text-slate-600'
                          }`}
                        >
                          {hasDrilldown ? (
                            <span className="text-blue-600 hover:underline font-medium">
                              {log.sync_type === 'pull_orders'
                                ? `View ${log.synced_order_ids.length} order(s)`
                                : `View ${log.pushed_items.length} item(s)`}
                            </span>
                          ) : (
                            log.error_message || '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {drilldownLog && (
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4"
            onClick={() => setDrilldownLog(null)}
          >
            <div
              className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  {CHANNEL_LABELS[drilldownLog.channel] || drilldownLog.channel} -{' '}
                  {drilldownLog.sync_type === 'pull_orders' ? 'Orders synced' : 'Items pushed'}
                </h3>
                <button
                  onClick={() => setDrilldownLog(null)}
                  className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              {drilldownLog.sync_type === 'pull_orders' ? (
                drilldownLoading ? (
                  <p className="text-sm text-slate-500">Loading...</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-4">Order #</th>
                        <th className="py-1 pr-4">Status</th>
                        <th className="py-1 pr-4">Total</th>
                        <th className="py-1">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(drilldownOrders || []).map((o) => (
                        <tr key={o.id}>
                          <td className="py-1.5 pr-4 font-medium">{o.order_number}</td>
                          <td className="py-1.5 pr-4">{o.status}</td>
                          <td className="py-1.5 pr-4">${Number(o.total_amount).toFixed(2)}</td>
                          <td className="py-1.5">{new Date(o.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1 pr-4">SKU</th>
                      <th className="py-1 pr-4">Quantity</th>
                      {drilldownLog.pushed_items[0]?.supplierId != null && (
                        <th className="py-1">Supplier ID</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drilldownLog.pushed_items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-4 font-medium">{item.sku}</td>
                        <td className="py-1.5 pr-4">{item.quantity}</td>
                        {item.supplierId != null && <td className="py-1.5">{item.supplierId}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
