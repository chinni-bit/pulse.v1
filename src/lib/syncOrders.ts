import type { SupabaseClient } from '@supabase/supabase-js';
import { getDropshipPurchaseOrders } from '@/lib/wayfair';
import { getWalmartOrders, type WalmartOrderLine } from '@/lib/walmart';

export interface SyncResult {
  ordersCreated: number;
  ordersUpdatedOnResync: number;
  ordersUnchanged: number;
  lineItemsMatched: number;
  lineItemsCancelled: number;
  lineItemsUnmatched: number;
  touchedOrderIds: string[];
  status: 'success' | 'failed';
  errorMessage: string | null;
}

const CHANNEL_TO_GROUP_NAME: Record<string, string> = {
  WAYFAIR: 'Wayfair',
  WM3P: 'Walmart',
  AMAZON3P: 'Amazon',
};

// New orders default to a customer group matching their channel name, if one
// exists (e.g. a Wayfair order defaults to a "Wayfair" customer group) -
// otherwise they stay unattributed/generic for manual assignment on the
// Orders page.
async function resolveDefaultCustomerGroupId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  tenantId: string,
  channel: string
): Promise<string | null> {
  const groupName = CHANNEL_TO_GROUP_NAME[channel];
  if (!groupName) return null;

  const { data } = await client
    .from('customer_groups')
    .select('id')
    .eq('tenant_id', tenantId)
    .ilike('name', groupName)
    .maybeSingle();

  return data?.id || null;
}

function emptyResult(): SyncResult {
  return {
    ordersCreated: 0,
    ordersUpdatedOnResync: 0,
    ordersUnchanged: 0,
    lineItemsMatched: 0,
    lineItemsCancelled: 0,
    lineItemsUnmatched: 0,
    touchedOrderIds: [],
    status: 'success',
    errorMessage: null,
  };
}

export function summarize(r: SyncResult): string {
  return (
    `orders created: ${r.ordersCreated}, unchanged: ${r.ordersUnchanged}, ` +
    `updated on resync (status/total changed, e.g. cancelled): ${r.ordersUpdatedOnResync}, ` +
    `line items matched: ${r.lineItemsMatched} (${r.lineItemsCancelled} cancelled), ` +
    `unmatched (no local product with that SKU): ${r.lineItemsUnmatched}`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncWayfairOrdersForTenant(client: SupabaseClient<any>, tenantId: string): Promise<SyncResult> {
  const result = emptyResult();

  try {
    const purchaseOrders = await getDropshipPurchaseOrders(25);

    const { data: products } = await client
      .from('products')
      .select('id, sku')
      .eq('tenant_id', tenantId)
      .is('deactivated_at', null);

    const productBySku = new Map((products || []).map((p) => [p.sku.toUpperCase(), p.id]));

    const { data: overrides } = await client
      .from('product_mappings')
      .select('product_id, channel_sku')
      .eq('tenant_id', tenantId)
      .eq('channel', 'WAYFAIR');

    (overrides || []).forEach((o) => {
      if (o.channel_sku) productBySku.set(o.channel_sku.toUpperCase(), o.product_id);
    });

    const defaultCustomerGroupId = await resolveDefaultCustomerGroupId(client, tenantId, 'WAYFAIR');

    for (const po of purchaseOrders) {
      const allCancelled = po.products.length > 0 && po.products.every((p) => p.isCancelled);
      const computedStatus = allCancelled ? 'CANCELLED' : 'PENDING';
      const totalAmount = po.products
        .filter((p) => !p.isCancelled)
        .reduce((sum, p) => sum + (p.totalCost || 0), 0);

      const { data: existing } = await client
        .from('orders')
        .select('id, status, total_amount')
        .eq('tenant_id', tenantId)
        .eq('channel', 'WAYFAIR')
        .eq('channel_order_id', po.poNumber)
        .maybeSingle();

      if (existing) {
        if (existing.status !== computedStatus || Number(existing.total_amount) !== totalAmount) {
          const { error: updateError } = await client
            .from('orders')
            .update({ status: computedStatus, total_amount: totalAmount })
            .eq('id', existing.id);
          if (updateError) throw new Error(`Failed to update order ${po.poNumber} status: ${updateError.message}`);
          result.ordersUpdatedOnResync++;
          result.touchedOrderIds.push(existing.id);
        } else {
          result.ordersUnchanged++;
        }
        continue;
      }

      const shippingAddress = po.shipTo
        ? [po.shipTo.name, po.shipTo.address1, po.shipTo.city, po.shipTo.state, po.shipTo.postalCode, po.shipTo.country]
            .filter(Boolean)
            .join(', ')
        : null;

      const { data: newOrder, error: orderError } = await client
        .from('orders')
        .insert({
          tenant_id: tenantId,
          order_number: po.poNumber,
          channel: 'WAYFAIR',
          channel_order_id: po.poNumber,
          customer_name: po.customerName,
          customer_email: po.customerEmail,
          customer_group_id: defaultCustomerGroupId,
          status: computedStatus,
          total_amount: totalAmount,
          shipping_address: shippingAddress,
        })
        .select('id')
        .single();

      if (orderError || !newOrder) throw new Error(`Failed to insert order ${po.poNumber}: ${orderError?.message}`);

      result.ordersCreated++;
      result.touchedOrderIds.push(newOrder.id);

      for (const item of po.products) {
        const productId = item.sku ? productBySku.get(item.sku.toUpperCase()) : undefined;
        if (!productId) {
          result.lineItemsUnmatched++;
          continue;
        }
        const { error: itemError } = await client.from('order_items').insert({
          tenant_id: tenantId,
          order_id: newOrder.id,
          product_id: productId,
          quantity_ordered: item.quantity ? parseInt(item.quantity, 10) : 1,
          unit_price: item.price,
          is_cancelled: item.isCancelled,
        });
        if (itemError) {
          result.lineItemsUnmatched++;
        } else {
          result.lineItemsMatched++;
          if (item.isCancelled) result.lineItemsCancelled++;
        }
      }
    }
  } catch (err) {
    result.status = 'failed';
    result.errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

function isLineCancelled(line: WalmartOrderLine): boolean {
  return (line.orderLineStatuses?.orderLineStatus || []).some((s) => s.status === 'Cancelled');
}

function lineProductAmount(line: WalmartOrderLine): number {
  const productCharge = (line.charges?.charge || []).find((c) => c.chargeType === 'PRODUCT');
  const amount = productCharge?.chargeAmount?.amount;
  return amount != null ? Number(amount) : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncWalmartOrdersForTenant(client: SupabaseClient<any>, tenantId: string): Promise<SyncResult> {
  const result = emptyResult();

  try {
    const orders = await getWalmartOrders(100);

    const { data: products } = await client
      .from('products')
      .select('id, sku')
      .eq('tenant_id', tenantId)
      .is('deactivated_at', null);

    const productBySku = new Map((products || []).map((p) => [p.sku.toUpperCase(), p.id]));

    const { data: overrides } = await client
      .from('product_mappings')
      .select('product_id, channel_sku')
      .eq('tenant_id', tenantId)
      .eq('channel', 'WM3P');

    (overrides || []).forEach((o) => {
      if (o.channel_sku) productBySku.set(o.channel_sku.toUpperCase(), o.product_id);
    });

    const defaultCustomerGroupId = await resolveDefaultCustomerGroupId(client, tenantId, 'WM3P');

    for (const order of orders) {
      const lines = order.orderLines?.orderLine || [];
      const allCancelled = lines.length > 0 && lines.every((l) => isLineCancelled(l));
      const computedStatus = allCancelled ? 'CANCELLED' : 'PENDING';
      const totalAmount = lines.filter((l) => !isLineCancelled(l)).reduce((sum, l) => sum + lineProductAmount(l), 0);

      const { data: existing } = await client
        .from('orders')
        .select('id, status, total_amount')
        .eq('tenant_id', tenantId)
        .eq('channel', 'WM3P')
        .eq('channel_order_id', order.purchaseOrderId)
        .maybeSingle();

      if (existing) {
        if (existing.status !== computedStatus || Number(existing.total_amount) !== totalAmount) {
          const { error: updateError } = await client
            .from('orders')
            .update({ status: computedStatus, total_amount: totalAmount })
            .eq('id', existing.id);
          if (updateError)
            throw new Error(`Failed to update order ${order.purchaseOrderId} status: ${updateError.message}`);
          result.ordersUpdatedOnResync++;
          result.touchedOrderIds.push(existing.id);
        } else {
          result.ordersUnchanged++;
        }
        continue;
      }

      const addr = order.shippingInfo?.postalAddress || null;
      const shippingAddress = addr
        ? [addr.name, addr.address1, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ')
        : null;

      const { data: newOrder, error: orderError } = await client
        .from('orders')
        .insert({
          tenant_id: tenantId,
          order_number: order.purchaseOrderId,
          channel: 'WM3P',
          channel_order_id: order.purchaseOrderId,
          customer_name: addr?.name || null,
          customer_email: order.customerEmailId,
          customer_group_id: defaultCustomerGroupId,
          status: computedStatus,
          total_amount: totalAmount,
          shipping_address: shippingAddress,
        })
        .select('id')
        .single();

      if (orderError || !newOrder)
        throw new Error(`Failed to insert order ${order.purchaseOrderId}: ${orderError?.message}`);

      result.ordersCreated++;
      result.touchedOrderIds.push(newOrder.id);

      for (const line of lines) {
        const sku = line.item?.sku;
        const productId = sku ? productBySku.get(sku.toUpperCase()) : undefined;
        if (!productId) {
          result.lineItemsUnmatched++;
          continue;
        }
        const quantity = line.orderLineQuantity?.amount ? parseInt(line.orderLineQuantity.amount, 10) : 1;
        const lineTotal = lineProductAmount(line);
        const cancelled = isLineCancelled(line);

        const { error: itemError } = await client.from('order_items').insert({
          tenant_id: tenantId,
          order_id: newOrder.id,
          product_id: productId,
          quantity_ordered: quantity,
          unit_price: quantity > 0 ? lineTotal / quantity : lineTotal,
          is_cancelled: cancelled,
        });
        if (itemError) {
          result.lineItemsUnmatched++;
        } else {
          result.lineItemsMatched++;
          if (cancelled) result.lineItemsCancelled++;
        }
      }
    }
  } catch (err) {
    result.status = 'failed';
    result.errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}
