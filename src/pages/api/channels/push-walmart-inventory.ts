import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { pushWalmartInventory } from '@/lib/walmart';

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

  let itemCount = 0;
  let errorCount = 0;
  let mappingCount = 0;
  const itemErrors: string[] = [];
  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | null = null;

  try {
    const { data: mappings, error: mappingsError } = await callerClient
      .from('product_mappings')
      .select('product_id, channel_sku')
      .eq('tenant_id', tenantId)
      .eq('channel', 'WALMART');

    if (mappingsError) {
      throw new Error(`Failed to read product_mappings: ${mappingsError.message}`);
    }

    mappingCount = mappings?.length || 0;

    if (mappingCount > 0) {
      const { data: batches } = await callerClient
        .from('inventory_batches')
        .select('product_id, quantity_available')
        .eq('tenant_id', tenantId);

      const availableByProduct = new Map<string, number>();
      (batches || []).forEach((b) => {
        availableByProduct.set(b.product_id, (availableByProduct.get(b.product_id) || 0) + (b.quantity_available || 0));
      });

      // Walmart's inventory endpoint is one SKU per call (no bulk
      // variant verified) - push sequentially so a slow/failed call
      // doesn't race the next one and errors are attributable per SKU.
      for (const mapping of mappings || []) {
        if (!mapping.channel_sku) continue;

        const quantity = availableByProduct.get(mapping.product_id) || 0;

        try {
          await pushWalmartInventory(mapping.channel_sku, quantity);
          itemCount++;
        } catch (err) {
          errorCount++;
          itemErrors.push(`${mapping.channel_sku}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      if (errorCount > 0 && itemCount === 0) {
        status = 'failed';
        errorMessage = itemErrors.join('; ');
      }
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  const summary =
    mappingCount === 0
      ? 'no products mapped to WALMART yet (product_mappings has no rows for this tenant/channel) - nothing to push'
      : `mapped products: ${mappingCount}, items pushed: ${itemCount}, item errors: ${errorCount}` +
        (itemErrors.length ? ` (${itemErrors.join('; ')})` : '');

  await callerClient.from('sync_logs').insert({
    tenant_id: tenantId,
    channel: 'WALMART',
    sync_type: 'push_inventory',
    status,
    records_synced: itemCount,
    records_failed: errorCount,
    error_message: errorMessage ? `${errorMessage} (${summary})` : summary,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  });

  if (status === 'failed') {
    return res.status(400).json({ error: errorMessage, summary });
  }

  return res.status(200).json({ mappingCount, itemCount, errorCount, itemErrors });
}
