const API_BASE_URL = process.env.WALMART_API_BASE_URL || 'https://sandbox.walmartapis.com';
const TOKEN_URL = `${API_BASE_URL}/v3/token`;

interface WalmartTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Exchanges the Walmart Client ID/Secret for a short-lived access token
 * (OAuth 2.0 client_credentials, Basic-auth'd). Server-side only - never
 * call this from client code, the client secret must never reach the
 * browser bundle. Tokens are valid 15 minutes per Walmart's docs.
 */
export async function getWalmartAccessToken(): Promise<string> {
  const clientId = process.env.WALMART_CLIENT_ID;
  const clientSecret = process.env.WALMART_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('WALMART_CLIENT_ID / WALMART_CLIENT_SECRET are not configured on the server');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'WM_SVC.NAME': 'Walmart Marketplace',
      'WM_QOS.CORRELATION_ID': `pulse-${Date.now()}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Walmart token request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as WalmartTokenResponse;
  return data.access_token;
}

export interface WalmartOrderLineStatus {
  status: string;
  statusQuantity: { unitOfMeasurement: string; amount: string } | null;
  cancellationReason: string | null;
}

export interface WalmartOrderLine {
  lineNumber: string;
  item: { productName: string | null; sku: string | null };
  // Walmart's sandbox returns chargeAmount.amount as a number for some
  // orders and a numeric string for others - normalize with Number(...)
  // wherever this is read, never assume it's already a number.
  charges: { charge: { chargeType: string; chargeAmount: { currency: string; amount: number | string } }[] } | null;
  orderLineQuantity: { unitOfMeasurement: string; amount: string };
  orderLineStatuses: { orderLineStatus: WalmartOrderLineStatus[] } | null;
}

export interface WalmartOrder {
  purchaseOrderId: string;
  customerOrderId: string | null;
  customerEmailId: string | null;
  orderDate: number | string | null;
  shippingInfo: {
    postalAddress: {
      name: string | null;
      address1: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    } | null;
  } | null;
  orderLines: { orderLine: WalmartOrderLine[] } | null;
}

/**
 * Pulls Walmart Marketplace orders (REST, v3/orders). Server-side only.
 * `limit` caps how many orders come back (Walmart's sandbox has a small
 * fixed mock dataset, so the default is generous relative to that).
 */
export async function getWalmartOrders(limit = 100): Promise<WalmartOrder[]> {
  const accessToken = await getWalmartAccessToken();

  const res = await fetch(`${API_BASE_URL}/v3/orders?limit=${limit}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'WM_SVC.NAME': 'Walmart Marketplace',
      'WM_QOS.CORRELATION_ID': `pulse-orders-${Date.now()}`,
      'WM_SEC.ACCESS_TOKEN': accessToken,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Walmart orders request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  return (json.list?.elements?.order || []) as WalmartOrder[];
}
