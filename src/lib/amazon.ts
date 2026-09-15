const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

export interface AmazonTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// Exchanges the one-time `spapi_oauth_code` Amazon hands back on the OAuth
// redirect for a long-lived refresh token. redirectUri must exactly match
// whatever's registered on the app in Developer Central - Amazon rejects a
// mismatch.
export async function exchangeAmazonAuthCode(code: string, redirectUri: string): Promise<AmazonTokenResponse> {
  const clientId = process.env.AMAZON_CLIENT_ID;
  const clientSecret = process.env.AMAZON_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('AMAZON_CLIENT_ID / AMAZON_CLIENT_SECRET not configured on the server');
  }

  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

// Mints a short-lived access token from the stored refresh token - needed
// before any real SP-API call. Not wired into a sync route yet; here for
// when that gets built.
export async function getAmazonAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.AMAZON_CLIENT_ID;
  const clientSecret = process.env.AMAZON_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('AMAZON_CLIENT_ID / AMAZON_CLIENT_SECRET not configured on the server');
  }

  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon access token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}
