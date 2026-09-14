const TOKEN_URL = 'https://sso.auth.wayfair.com/oauth/token';
const API_AUDIENCE = process.env.WAYFAIR_API_AUDIENCE || 'https://api.wayfair.com/';
const API_BASE_URL = process.env.WAYFAIR_API_BASE_URL || 'https://api.wayfair.com';

interface WayfairTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Exchanges the Wayfair Client ID/Secret for a short-lived access token
 * (OAuth 2.0 client_credentials grant, Auth0-issued). Server-side only -
 * never call this from client code, the client secret must never reach
 * the browser bundle.
 */
export async function getWayfairAccessToken(): Promise<string> {
  const clientId = process.env.WAYFAIR_CLIENT_ID;
  const clientSecret = process.env.WAYFAIR_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('WAYFAIR_CLIENT_ID / WAYFAIR_CLIENT_SECRET are not configured on the server');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: API_AUDIENCE,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wayfair token request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as WayfairTokenResponse;
  return data.access_token;
}

export interface WayfairPurchaseOrderProduct {
  sku: string | null;
  name: string | null;
  quantity: string | null;
  price: number | null;
  totalCost: number | null;
  isCancelled: boolean;
}

export interface WayfairShipToAddress {
  name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface WayfairPurchaseOrder {
  id: number;
  poNumber: string;
  poDate: string | null;
  orderId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  salesChannelName: string | null;
  orderType: string | null;
  shipTo: WayfairShipToAddress | null;
  products: WayfairPurchaseOrderProduct[];
}

const DROPSHIP_PO_QUERY = `
  query DropshipPOs($limit: Int32, $fromDate: IsoDateTime) {
    getDropshipPurchaseOrders(limit: $limit, fromDate: $fromDate) {
      id
      poNumber
      poDate
      orderId
      customerName
      customerEmail
      salesChannelName
      orderType
      shipTo { name address1 city state postalCode country }
      products { sku name quantity price totalCost isCancelled }
    }
  }
`;

/**
 * Pulls Wayfair dropship purchase orders (GraphQL). Server-side only.
 * `limit` caps how many POs come back; `fromDate` (ISO 8601) restricts to
 * POs created on/after that date - omit both to get Wayfair's default
 * page of recent orders.
 */
export async function getDropshipPurchaseOrders(
  limit = 25,
  fromDate?: string
): Promise<WayfairPurchaseOrder[]> {
  const accessToken = await getWayfairAccessToken();

  const res = await fetch(`${API_BASE_URL}/v1/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query: DROPSHIP_PO_QUERY, variables: { limit, fromDate } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wayfair purchase orders request failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Wayfair GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`);
  }

  return (json.data?.getDropshipPurchaseOrders || []) as WayfairPurchaseOrder[];
}

export interface WayfairInventoryItem {
  supplierPartNumber: string;
  quantityOnHand: number;
}

export interface WayfairInventoryItemError {
  key: string;
  message: string;
}

export interface WayfairInventoryResult {
  id: string;
  status: string;
  itemCount: number;
  errorCount: number;
  errors: WayfairInventoryItemError[];
}

const SAVE_INVENTORY_MUTATION = `
  mutation SaveInventory($inventory: [inventoryInput!]!, $feedKind: inventoryFeedKind, $dryRun: Boolean) {
    inventory {
      save(inventory: $inventory, feedKind: $feedKind, dryRun: $dryRun) {
        id
        status
        itemCount
        errorCount
        errors { key message }
      }
    }
  }
`;

/**
 * Pushes absolute on-hand quantities to Wayfair (GraphQL, TRUE_UP feed -
 * each item's quantityOnHand replaces what Wayfair has, it's not a delta).
 * Server-side only.
 *
 * Requires WAYFAIR_SUPPLIER_ID - Wayfair's inventory mutation rejects
 * every item with "Invalid supplier id" without it (confirmed live via
 * dryRun), and it's account-specific data only found on Wayfair's own
 * Partner Home / supplier profile page, not derivable from the API or
 * the Client ID/Secret.
 */
export async function pushWayfairInventory(
  items: WayfairInventoryItem[],
  dryRun = false
): Promise<WayfairInventoryResult> {
  const supplierId = process.env.WAYFAIR_SUPPLIER_ID;
  if (!supplierId) {
    throw new Error(
      'WAYFAIR_SUPPLIER_ID is not configured on the server. Find it on Wayfair\'s Partner Home ' +
        '(supplier profile / account settings) and add it to .env.local and Vercel - server-side, ' +
        'a plain number is fine to expose since it is not a credential, but keep it out of NEXT_PUBLIC_* ' +
        'anyway for consistency with the other channel config.'
    );
  }

  const accessToken = await getWayfairAccessToken();

  const res = await fetch(`${API_BASE_URL}/v1/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      query: SAVE_INVENTORY_MUTATION,
      variables: {
        inventory: items.map((item) => ({ ...item, supplierId: Number(supplierId) })),
        feedKind: 'TRUE_UP',
        dryRun,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wayfair inventory push failed (${res.status}): ${body.slice(0, 500)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Wayfair GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`);
  }

  return json.data.inventory.save as WayfairInventoryResult;
}
