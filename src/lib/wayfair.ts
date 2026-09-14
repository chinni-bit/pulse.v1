const TOKEN_URL = 'https://sso.auth.wayfair.com/oauth/token';
const API_AUDIENCE = process.env.WAYFAIR_API_AUDIENCE || 'https://api.wayfair.com/';

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
