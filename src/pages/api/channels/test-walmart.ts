import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getWalmartAccessToken } from '@/lib/walmart';

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

  const startedAt = new Date().toISOString();
  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | null = null;

  try {
    const accessToken = await getWalmartAccessToken();
    if (!accessToken) {
      throw new Error('No access_token in Walmart response');
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  await callerClient.from('sync_logs').insert({
    tenant_id: callerProfile.tenant_id,
    channel: 'WALMART',
    sync_type: 'connection_test',
    status,
    error_message: errorMessage,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  });

  if (status === 'failed') {
    return res.status(400).json({ error: errorMessage });
  }

  return res.status(200).json({ ok: true });
}
