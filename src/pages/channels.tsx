'use client';

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
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
}

const TESTABLE: Record<string, string> = {
  WAYFAIR: '/api/channels/test-wayfair',
  WALMART: '/api/channels/test-walmart',
};

const SYNCABLE: Record<string, string> = {
  WAYFAIR: '/api/channels/sync-wayfair-orders',
  WALMART: '/api/channels/sync-walmart-orders',
};

const PUSHABLE: Record<string, string> = {
  WAYFAIR: '/api/channels/push-wayfair-inventory',
  WALMART: '/api/channels/push-walmart-inventory',
};

export default function Channels() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<Record<string, string>>({});
  const [pushing, setPushing] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);

    const { data: channelsData } = await supabase
      .from('channels')
      .select('id, channel_name, is_active, sync_frequency_minutes, last_sync_at')
      .order('channel_name', { ascending: true });

    const { data: logsData } = await supabase
      .from('sync_logs')
      .select('id, channel, sync_type, status, error_message, started_at, completed_at')
      .order('started_at', { ascending: false })
      .limit(20);

    setChannels(channelsData || []);
    setLogs(logsData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (err) {
      console.error('Logout failed:', err);
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
        ? `${result.mappingCount} product(s) mapped to this channel, ${result.itemCount} pushed, ${result.errorCount} error(s)`
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
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
                ← Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">Channels</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-slate-600">{user?.email}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            Wayfair and Walmart can both pull orders and push inventory. A fully cancelled order
            is marked Cancelled and excluded from its own total; order line items only link to a
            local product when the SKU matches exactly - sandbox test SKUs mostly won&apos;t match
            real products yet, expected, not a bug. Inventory push needs a product mapped to a
            channel SKU first (<code>product_mappings</code> table - no UI to manage these yet, so
            it correctly pushes 0 items until at least one exists). Wayfair inventory push also
            needs <code>WAYFAIR_SUPPLIER_ID</code> configured - without it every item is rejected.
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {channels.map((channel) => (
                <div key={channel.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-lg font-semibold text-slate-900">{channel.channel_name}</h2>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        channel.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {channel.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">
                    Last sync: {channel.last_sync_at ? new Date(channel.last_sync_at).toLocaleString() : 'Never'}
                  </p>

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
              ))}
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
                    <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">{log.channel}</td>
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
                      <td className="px-6 py-4 text-sm text-red-600">{log.error_message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
