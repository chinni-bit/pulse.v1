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
  let ordersSkippedExisting = 0;
  let lineItemsMatched = 0;
  let lineItemsUnmatched = 0;
  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | null = null;

  try {
    const purchaseOrders = await getDropshipPurchaseOrders(25);

    // Pull the tenant's product SKUs once, so each PO's line items can be
    // matched in memory instead of a query per line item.
    const { data: products } = await callerClient
      .from('products')
      .select('id, sku')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    const productBySku = new Map((products || []).map((p) => [p.sku.toUpperCase(), p.id]));

    for (const po of purchaseOrders) {
      const { data: existing } = await callerClient
        .from('orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('channel', 'WAYFAIR')
        .eq('channel_order_id', po.poNumber)
        .maybeSingle();

      if (existing) {
        ordersSkippedExisting++;
        continue;
      }

      const totalAmount = po.products.reduce((sum, p) => sum + (p.totalCost || 0), 0);
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
          status: 'PENDING',
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
        });

        if (itemError) {
          lineItemsUnmatched++;
        } else {
          lineItemsMatched++;
        }
      }
    }
  } catch (err) {
    status = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  const summary = `orders created: ${ordersCreated}, already existed: ${ordersSkippedExisting}, line items matched: ${lineItemsMatched}, unmatched (no local product with that SKU): ${lineItemsUnmatched}`;

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
    ordersSkippedExisting,
    lineItemsMatched,
    lineItemsUnmatched,
  });
}
