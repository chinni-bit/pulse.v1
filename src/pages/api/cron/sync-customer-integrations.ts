import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { syncWayfairOrdersForTenant, syncWalmartOrdersForTenant, summarize } from '@/lib/syncOrders';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;

// Runs on a schedule (see vercel.json) to auto-pull orders for every
// tenant/channel whose configured sync_frequency_minutes has elapsed since
// its last sync. No user session exists here, so this uses the
// service-role key directly instead of a caller-scoped client - the same
// pattern used by /api/admin/create-user.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron sends its own bearer token; a manual/external pinger can
  // send the same secret as `x-cron-secret` instead.
  const vercelCronAuth = req.headers.authorization === `Bearer ${cronSecret}`;
  const manualAuth = req.headers['x-cron-secret'] === cronSecret;
  if (!cronSecret || (!vercelCronAuth && !manualAuth)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: channels, error: channelsError } = await admin
    .from('customer_integrations')
    .select('id, tenant_id, channel_name, is_active, last_sync_at, sync_frequency_minutes')
    .eq('is_active', true)
    .in('channel_name', ['WAYFAIR', 'WM3P']);

  if (channelsError) {
    return res.status(500).json({ error: channelsError.message });
  }

  const now = Date.now();
  const due = (channels || []).filter((c) => {
    if (!c.last_sync_at) return true;
    const elapsedMinutes = (now - new Date(c.last_sync_at).getTime()) / 60000;
    return elapsedMinutes >= c.sync_frequency_minutes;
  });

  const results: { tenant_id: string; channel: string; status: string; summary: string }[] = [];

  for (const channel of due) {
    const startedAt = new Date().toISOString();
    const result =
      channel.channel_name === 'WAYFAIR'
        ? await syncWayfairOrdersForTenant(admin, channel.tenant_id)
        : await syncWalmartOrdersForTenant(admin, channel.tenant_id);
    const summary = summarize(result);

    await admin.from('sync_logs').insert({
      tenant_id: channel.tenant_id,
      channel: channel.channel_name,
      sync_type: 'pull_orders',
      status: result.status,
      records_synced: result.ordersCreated,
      records_failed: result.lineItemsUnmatched,
      error_message: result.errorMessage ? `${result.errorMessage} (${summary})` : summary,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      synced_order_ids: result.touchedOrderIds,
    });

    if (result.status === 'success') {
      await admin.from('customer_integrations').update({ last_sync_at: new Date().toISOString() }).eq('id', channel.id);
    }

    results.push({ tenant_id: channel.tenant_id, channel: channel.channel_name, status: result.status, summary });
  }

  return res.status(200).json({ checked: channels?.length || 0, due: due.length, results });
}
