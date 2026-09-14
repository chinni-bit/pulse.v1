import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { pushWayfairInventory } from '@/lib/wayfair';

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
  let warehouseCount = 0;
  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | null = null;
  let itemErrors: string[] = [];

  try {
    // Wayfair assigns a supplier ID per fulfillment warehouse (they use
    // it to work out shipping cost/sourcing) - only warehouses with one
    // configured are reportable to Wayfair at all.
    const { data: warehouses, error: warehousesError } = await callerClient
      .from('warehouses')
      .select('id, code, wayfair_supplier_id')
      .eq('tenant_id', tenantId)
      .not('wayfair_supplier_id', 'is', null);

    if (warehousesError) {
      throw new Error(`Failed to read warehouses: ${warehousesError.message}`);
    }

    warehouseCount = warehouses?.length || 0;

    const { data: mappings, error: mappingsError } = await callerClient
      .from('product_mappings')
      .select('product_id, channel_sku')
      .eq('tenant_id', tenantId)
      .eq('channel', 'WAYFAIR');

    if (mappingsError) {
      throw new Error(`Failed to read product_mappings: ${mappingsError.message}`);
    }

    mappingCount = mappings?.length || 0;

    if (warehouseCount > 0 && mappingCount > 0) {
      const warehouseIds = (warehouses || []).map((w) => w.id);

      // batch_locations is the per-warehouse breakdown of inventory_batches
      // (a batch has no warehouse of its own - it's split across
      // locations via this table). Its quantity is treated as the
      // sellable amount of that batch at that specific warehouse.
      const { data: locations } = await callerClient
        .from('batch_locations')
        .select('warehouse_id, quantity, inventory_batches!inner(product_id)')
        .eq('tenant_id', tenantId)
        .in('warehouse_id', warehouseIds);

      const qtyByProductWarehouse = new Map<string, number>();
      (locations || []).forEach((loc) => {
        const productId = (loc.inventory_batches as unknown as { product_id: string }).product_id;
        const key = `${productId}::${loc.warehouse_id}`;
        qtyByProductWarehouse.set(key, (qtyByProductWarehouse.get(key) || 0) + (loc.quantity || 0));
      });

      // One combined push: every mapped product x every configured
      // warehouse, each item tagged with that warehouse's own supplier
      // ID. Missing combinations push 0, not omitted, so a warehouse
      // that just sold out is reported accurately instead of silently
      // left at its last known (wrong) quantity.
      const items = (mappings || [])
        .filter((m) => m.channel_sku)
        .flatMap((m) =>
          (warehouses || []).map((w) => ({
            supplierPartNumber: m.channel_sku as string,
            quantityOnHand: qtyByProductWarehouse.get(`${m.product_id}::${w.id}`) || 0,
            supplierId: w.wayfair_supplier_id as number,
          }))
        );

      const result = await pushWayfairInventory(items, false);
      // inventory.save is processed asynchronously - result.itemCount /
      // result.errorCount reflect completion state at the instant this
      // call returns, which is always ~0 right after submitting (proven
      // live: a run that got a real "Invalid supplier id" rejection back
      // still showed errorCount: 0, with the actual error only visible
      // in the errors[] array). errors[] is the one field that's
      // populated immediately for validation failures, so use its
      // length instead of trusting the counts.
      itemErrors = result.errors.map((e) => `${e.key}: ${e.message}`);
      errorCount = result.errors.length;
      itemCount = items.length - errorCount;

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
    warehouseCount === 0
      ? 'no warehouses have a Wayfair supplier ID configured yet - nothing to push'
      : mappingCount === 0
        ? 'no products mapped to WAYFAIR yet (product_mappings has no rows for this tenant/channel) - nothing to push'
        : `${warehouseCount} warehouse(s) configured, ${mappingCount} mapped product(s), items pushed: ${itemCount}, item errors: ${errorCount}` +
          (itemErrors.length ? ` (${itemErrors.join('; ')})` : '');

  await callerClient.from('sync_logs').insert({
    tenant_id: tenantId,
    channel: 'WAYFAIR',
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

  return res.status(200).json({ warehouseCount, mappingCount, itemCount, errorCount, itemErrors });
}
