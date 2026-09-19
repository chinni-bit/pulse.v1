import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { syncWalmartOrdersForTenant, summarize } from '@/lib/syncOrders';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user: callerUser },
  } = await callerClient.auth.getUser(token);

  if (!callerUser) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { data: callerProfile } = await callerClient
    .from('users')
    .select('tenant_id')
    .eq('id', callerUser.id)
    .single();

  if (!callerProfile) {
    return res.status(403).json({ error: 'Could not verify caller permissions' });
  }

  const tenantId = callerProfile.tenant_id;
  const startedAt = new Date().toISOString();

  const result = await syncWalmartOrdersForTenant(callerClient, tenantId);
  const summary = summarize(result);

  await callerClient.from('sync_logs').insert({
    tenant_id: tenantId,
    channel: 'WM3P',
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
    await callerClient
      .from('customer_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('channel_name', 'WM3P');
  }

  if (result.status === 'failed') {
    return res.status(400).json({ error: result.errorMessage, summary });
  }

  return res.status(200).json({
    ordersCreated: result.ordersCreated,
    ordersUnchanged: result.ordersUnchanged,
    ordersUpdatedOnResync: result.ordersUpdatedOnResync,
    lineItemsMatched: result.lineItemsMatched,
    lineItemsCancelled: result.lineItemsCancelled,
    lineItemsUnmatched: result.lineItemsUnmatched,
  });
}
