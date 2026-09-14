import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getDropshipPurchaseOrders } from '@/lib/wayfair';

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

  let ordersCreated = 0;
  let ordersUpdatedOnResync = 0;
  let ordersUnchanged = 0;
  let lineItemsMatched = 0;
  let lineItemsCancelled = 0;
  let lineItemsUnmatched = 0;
  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | null = null;

  try {
    const purchaseOrders = await getDropshipPurchaseOrders(25);

    // Pull the tenant's product SKUs once, so each PO's line items can be
    // matched in memory instead of a query per line item. Default is the
    // product's own SKU (Wayfair's Supplier Part Number is meant to be
    // set to the supplier's own SKU - confirmed via Wayfair's own
    // integration docs); an explicit product_mappings row overrides that
    // for the rare product actually listed under a different code.
    const { data: products } = await callerClient
      .from('products')
      .select('id, sku')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    const productBySku = new Map((products || []).map((p) => [p.sku.toUpperCase(), p.id]));

    const { data: overrides } = await callerClient
      .from('product_mappings')
      .select('product_id, channel_sku')
      .eq('tenant_id', tenantId)
      .eq('channel', 'WAYFAIR');

    (overrides || []).forEach((o) => {
      if (o.channel_sku) productBySku.set(o.channel_sku.toUpperCase(), o.product_id);
    });

    for (const po of purchaseOrders) {
      // A PO where every line item is cancelled is a cancelled order.
      // Wayfair doesn't send a separate "order cancelled" flag - this is
      // inferred, same as Wayfair's own dashboards do it.
      const allCancelled = po.products.length > 0 && po.products.every((p) => p.isCancelled);
      const computedStatus = allCancelled ? 'CANCELLED' : 'PENDING';
      // Cancelled line items didn't ship and shouldn't count toward the
      // order's value.
      const totalAmount = po.products
        .filter((p) => !p.isCancelled)
        .reduce((sum, p) => sum + (p.totalCost || 0), 0);

      const { data: existing } = await callerClient
        .from('orders')
        .select('id, status, total_amount')
        .eq('tenant_id', tenantId)
        .eq('channel', 'WAYFAIR')
        .eq('channel_order_id', po.poNumber)
        .maybeSingle();

      if (existing) {
        // Already pulled before - reconcile status + total only (e.g.
        // Wayfair cancelled it after the initial pull). Line items for
        // existing orders aren't touched here; a full line-item diff on
        // every resync isn't worth the complexity for what this feature
        // needs.
        if (existing.status !== computedStatus || Number(existing.total_amount) !== totalAmount) {
          const { error: updateError } = await callerClient
            .from('orders')
            .update({ status: computedStatus, total_amount: totalAmount })
            .eq('id', existing.id);

          if (updateError) {
            throw new Error(`Failed to update order ${po.poNumber} status: ${updateError.message}`);
          }
          ordersUpdatedOnResync++;
        } else {
          ordersUnchanged++;
        }
        continue;
      }

      const shippingAddress = po.shipTo
        ? [po.shipTo.name, po.shipTo.address1, po.shipTo.city, po.shipTo.state, po.shipTo.postalCode, po.shipTo.country]
            .filter(Boolean)
            .join(', ')
        : null;

      const { data: newOrder, error: orderError } = await callerClient
        .from('orders')
        .insert({
          tenant_id: tenantId,
          order_number: po.poNumber,
          channel: 'WAYFAIR',
          channel_order_id: po.poNumber,
          customer_name: po.customerName,
          customer_email: po.customerEmail,
          status: computedStatus,
          total_amount: totalAmount,
          shipping_address: shippingAddress,
        })
        .select('id')
        .single();

      if (orderError || !newOrder) {
        throw new Error(`Failed to insert order ${po.poNumber}: ${orderError?.message}`);
      }

      ordersCreated++;

      for (const item of po.products) {
        const productId = item.sku ? productBySku.get(item.sku.toUpperCase()) : undefined;

        if (!productId) {
          lineItemsUnmatched++;
          continue;
        }

        const { error: itemError } = await callerClient.from('order_items').insert({
          tenant_id: tenantId,
          order_id: newOrder.id,
          product_id: productId,
          quantity_ordered: item.quantity ? parseInt(item.quantity, 10) : 1,
          unit_price: item.price,
          is_cancelled: item.isCancelled,
        });

        if (itemError) {
          lineItemsUnmatched++;
        } else {
          lineItemsMatched++;
          if (item.isCancelled) lineItemsCancelled++;
        }
      }
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  const summary =
    `orders created: ${ordersCreated}, unchanged: ${ordersUnchanged}, ` +
    `updated on resync (status/total changed, e.g. cancelled): ${ordersUpdatedOnResync}, ` +
    `line items matched: ${lineItemsMatched} (${lineItemsCancelled} cancelled), ` +
    `unmatched (no local product with that SKU): ${lineItemsUnmatched}`;

  await callerClient.from('sync_logs').insert({
    tenant_id: tenantId,
    channel: 'WAYFAIR',
    sync_type: 'pull_orders',
    status,
    records_synced: ordersCreated,
    records_failed: lineItemsUnmatched,
    error_message: errorMessage ? `${errorMessage} (${summary})` : summary,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
  });

  if (status === 'failed') {
    return res.status(400).json({ error: errorMessage, summary });
  }

  return res.status(200).json({
    ordersCreated,
    ordersUnchanged,
    ordersUpdatedOnResync,
    lineItemsMatched,
    lineItemsCancelled,
    lineItemsUnmatched,
  });
}
