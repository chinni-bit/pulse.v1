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
  let productCount = 0;
  let overrideCount = 0;
  const itemErrors: string[] = [];
  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | null = null;

  try {
    // Every active product is reportable by default, using its own SKU
    // (Walmart's "sku" field is explicitly seller-assigned, not
    // Walmart-assigned - confirmed via Walmart's own API docs).
    // product_mappings only needs a row for the rare product actually
    // listed under a different code.
    const { data: products, error: productsError } = await callerClient
      .from('products')
      .select('id, sku')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (productsError) {
      throw new Error(`Failed to read products: ${productsError.message}`);
    }

    productCount = products?.length || 0;

    const { data: overrides, error: overridesError } = await callerClient
      .from('product_mappings')
      .select('product_id, channel_sku')
      .eq('tenant_id', tenantId)
      .eq('channel', 'WALMART');

    if (overridesError) {
      throw new Error(`Failed to read product_mappings: ${overridesError.message}`);
    }

    const skuOverrideByProduct = new Map(
      (overrides || []).filter((o) => o.channel_sku).map((o) => [o.product_id, o.channel_sku as string])
    );
    overrideCount = skuOverrideByProduct.size;

    if (productCount > 0) {
      const { data: batches } = await callerClient
        .from('inventory_batches')
        .select('product_id, quantity_available')
        .eq('tenant_id', tenantId);

      const availableByProduct = new Map<string, number>();
      (batches || []).forEach((b) => {
        availableByProduct.set(b.product_id, (availableByProduct.get(b.product_id) || 0) + (b.quantity_available || 0));
      });

      // Walmart's inventory endpoint is one SKU per call (no bulk variant
      // verified) - push sequentially with a small delay between calls.
      // Confirmed live that this is necessary, not just cautious: pushing
      // 15 products back-to-back with no delay hit Walmart's sandbox rate
      // limit (REQUEST_THRESHOLD_VIOLATED, HTTP 429) on 4 of them. A
      // larger catalog would still need real retry/backoff handling,
      // which this doesn't have yet - each failure here is just counted
      // and reported, not retried.
      for (const product of products || []) {
        const sku = skuOverrideByProduct.get(product.id) || product.sku;
        const quantity = availableByProduct.get(product.id) || 0;

        try {
          await pushWalmartInventory(sku, quantity);
          itemCount++;
        } catch (err) {
          errorCount++;
          itemErrors.push(`${sku}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
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
    productCount === 0
      ? 'no active products to push'
      : `${productCount} product(s) (${overrideCount} with a channel-specific SKU override, rest use their own SKU), items pushed: ${itemCount}, item errors: ${errorCount}` +
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

  return res.status(200).json({ productCount, overrideCount, itemCount, errorCount, itemErrors });
}
