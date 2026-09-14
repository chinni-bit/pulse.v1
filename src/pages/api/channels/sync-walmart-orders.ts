import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getWalmartOrders, type WalmartOrderLine } from '@/lib/walmart';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

function isLineCancelled(line: WalmartOrderLine): boolean {
  return (line.orderLineStatuses?.orderLineStatus || []).some((s) => s.status === 'Cancelled');
}

function lineProductAmount(line: WalmartOrderLine): number {
  const productCharge = (line.charges?.charge || []).find((c) => c.chargeType === 'PRODUCT');
  const amount = productCharge?.chargeAmount?.amount;
  // Walmart's sandbox mixes number and numeric-string types for this
  // field across orders - Number(...) normalizes both. Without this, a
  // string here would make `sum + amount` do string concatenation
  // instead of addition (0 + '10' === '010', not 10).
  return amount != null ? Number(amount) : 0;
}

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
    const orders = await getWalmartOrders(100);

    const { data: products } = await callerClient
      .from('products')
      .select('id, sku')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    const productBySku = new Map((products || []).map((p) => [p.sku.toUpperCase(), p.id]));

    for (const order of orders) {
      const lines = order.orderLines?.orderLine || [];
      // Same rule as Wayfair: an order where every line is cancelled is
      // treated as a cancelled order. Walmart has no separate
      // order-level cancelled flag either.
      const allCancelled = lines.length > 0 && lines.every((l) => isLineCancelled(l));
      const computedStatus = allCancelled ? 'CANCELLED' : 'PENDING';
      const totalAmount = lines
        .filter((l) => !isLineCancelled(l))
        .reduce((sum, l) => sum + lineProductAmount(l), 0);

      const { data: existing } = await callerClient
        .from('orders')
        .select('id, status, total_amount')
        .eq('tenant_id', tenantId)
        .eq('channel', 'WALMART')
        .eq('channel_order_id', order.purchaseOrderId)
        .maybeSingle();

      if (existing) {
        if (existing.status !== computedStatus || Number(existing.total_amount) !== totalAmount) {
          const { error: updateError } = await callerClient
            .from('orders')
            .update({ status: computedStatus, total_amount: totalAmount })
            .eq('id', existing.id);

          if (updateError) {
            throw new Error(`Failed to update order ${order.purchaseOrderId} status: ${updateError.message}`);
          }
          ordersUpdatedOnResync++;
        } else {
          ordersUnchanged++;
        }
        continue;
      }

      const addr = order.shippingInfo?.postalAddress || null;
      const shippingAddress = addr
        ? [addr.name, addr.address1, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ')
        : null;

      const { data: newOrder, error: orderError } = await callerClient
        .from('orders')
        .insert({
          tenant_id: tenantId,
          order_number: order.purchaseOrderId,
          channel: 'WALMART',
          channel_order_id: order.purchaseOrderId,
          customer_name: addr?.name || null,
          customer_email: order.customerEmailId,
          status: computedStatus,
          total_amount: totalAmount,
          shipping_address: shippingAddress,
        })
        .select('id')
        .single();

      if (orderError || !newOrder) {
        throw new Error(`Failed to insert order ${order.purchaseOrderId}: ${orderError?.message}`);
      }

      ordersCreated++;

      for (const line of lines) {
        const sku = line.item?.sku;
        const productId = sku ? productBySku.get(sku.toUpperCase()) : undefined;

        if (!productId) {
          lineItemsUnmatched++;
          continue;
        }

        const quantity = line.orderLineQuantity?.amount ? parseInt(line.orderLineQuantity.amount, 10) : 1;
        const lineTotal = lineProductAmount(line);
        const cancelled = isLineCancelled(line);

        const { error: itemError } = await callerClient.from('order_items').insert({
          tenant_id: tenantId,
          order_id: newOrder.id,
          product_id: productId,
          quantity_ordered: quantity,
          unit_price: quantity > 0 ? lineTotal / quantity : lineTotal,
          is_cancelled: cancelled,
        });

        if (itemError) {
          lineItemsUnmatched++;
        } else {
          lineItemsMatched++;
          if (cancelled) lineItemsCancelled++;
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
    channel: 'WALMART',
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
