'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { MobileLayout } from '@/components/MobileLayout';
import { supabase } from '@/lib/supabase';

interface ChannelInfo {
  channel_name: string;
  is_active: boolean;
  last_sync_at: string | null;
  sync_frequency_minutes: number | null;
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

const CHANNEL_LABELS: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart',
  AMAZON3P: 'Amazon',
  SHOPIFY: 'Shopify',
};

function isSuccess(status: string) {
  return status === 'success' || status === 'SUCCESS';
}

export default function MobileSync() {
  const { tenantId } = useAuthStore();
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const fetchAll = async () => {
      setLoading(true);
      const [{ data: chData }, { data: logData }] = await Promise.all([
        supabase.from('customer_integrations').select('channel_name, is_active, last_sync_at, sync_frequency_minutes').eq('tenant_id', tenantId).order('channel_name'),
        supabase.from('sync_logs').select('id, channel, sync_type, status, records_synced, records_failed, error_message, started_at').eq('tenant_id', tenantId).order('started_at', { ascending: false }).limit(30),
      ]);
      setChannels((chData as ChannelInfo[]) || []);
      setLogs((logData as SyncLog[]) || []);
      setLoading(false);
    };
    fetchAll();
  }, [tenantId]);

  return (
    <ProtectedRoute>
      <MobileLayout title="Sync Status">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {channels.length === 0 ? (
                <p className="text-sm text-slate-500">No channels configured.</p>
              ) : (
                channels.map((c) => (
                  <div key={c.channel_name} className="bg-white rounded-xl shadow-sm p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{CHANNEL_LABELS[c.channel_name] || c.channel_name}</p>
                      <p className="text-xs text-slate-500">
                        Last sync: {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}
                      </p>
                      {c.sync_frequency_minutes != null && (
                        <p className="text-[11px] text-slate-400">Every {c.sync_frequency_minutes} min</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-green-600' : 'bg-slate-400'}`} />
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <h2 className="text-xs font-semibold text-slate-900 uppercase tracking-wide mb-3">Recent Sync Runs</h2>
              {logs.length === 0 ? (
                <p className="text-sm text-slate-500">No sync runs recorded.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <div key={l.id} className="py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">{CHANNEL_LABELS[l.channel] || l.channel} · {l.sync_type}</p>
                        <span className={`text-xs font-medium ${isSuccess(l.status) ? 'text-green-700' : 'text-red-600'}`}>
                          {isSuccess(l.status) ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {new Date(l.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {l.records_synced != null && ` · ${l.records_synced} synced`}
                        {l.records_failed ? ` · ${l.records_failed} failed` : ''}
                      </p>
                      {l.error_message && !isSuccess(l.status) && (
                        <p className="text-xs text-red-600 mt-0.5">{l.error_message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </MobileLayout>
    </ProtectedRoute>
  );
}
