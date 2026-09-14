const TOKEN_URL = process.env.WALMART_API_BASE_URL
  ? `${process.env.WALMART_API_BASE_URL}/v3/token`
  : 'https://sandbox.walmartapis.com/v3/token';

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
