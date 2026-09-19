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
  const pushedItems: { sku: string; quantity: number }[] = [];

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
      .is('deactivated_at', null);

    if (productsError) {
      throw new Error(`Failed to read products: ${productsError.message}`);
    }

    productCount = products?.length || 0;

    const { data: overrides, error: overridesError } = await callerClient
      .from('product_mappings')
      .select('product_id, channel_sku')
      .eq('tenant_id', tenantId)
      .eq('channel', 'WM3P');

    if (overridesError) {
      throw new Error(`Failed to read product_mappings: ${overridesError.message}`);
    }

    // A product can be listed under several different SKUs on the same
    // channel now (owner feedback 2026-09-15 - same product sold under
    // multiple names). Every listing for a product replaces the default
    // own-SKU push, not just the first/last one found.
    const listingsByProduct = new Map<string, string[]>();
    (overrides || [])
      .filter((o) => o.channel_sku)
      .forEach((o) => {
        const list = listingsByProduct.get(o.product_id) || [];
        list.push(o.channel_sku as string);
        listingsByProduct.set(o.product_id, list);
      });
    overrideCount = overrides?.filter((o) => o.channel_sku).length || 0;

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
        const skus = listingsByProduct.get(product.id) || [product.sku];
        const quantity = availableByProduct.get(product.id) || 0;

        for (const sku of skus) {
          try {
            await pushWalmartInventory(sku, quantity);
            itemCount++;
            pushedItems.push({ sku, quantity });
          } catch (err) {
            errorCount++;
            itemErrors.push(`${sku}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
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
    productCount === 0
      ? 'no active products to push'
      : `${productCount} product(s) (${overrideCount} with a channel-specific SKU override, rest use their own SKU), items pushed: ${itemCount}, item errors: ${errorCount}` +
        (itemErrors.length ? ` (${itemErrors.join('; ')})` : '');

  await callerClient.from('sync_logs').insert({
    tenant_id: tenantId,
    channel: 'WM3P',
    sync_type: 'push_inventory',
    status,
    records_synced: itemCount,
    records_failed: errorCount,
    error_message: errorMessage ? `${errorMessage} (${summary})` : summary,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    pushed_items: pushedItems,
  });

  if (status === 'failed') {
    return res.status(400).json({ error: errorMessage, summary });
  }

  return res.status(200).json({ productCount, overrideCount, itemCount, errorCount, itemErrors });
}
