import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { exchangeAmazonAuthCode } from '@/lib/amazon';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function page(title: string, message: string, ok: boolean) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 20px;color:#1e293b}
h1{color:${ok ? '#15803d' : '#b91c1c'}}</style></head>
<body><h1>${title}</h1><p>${message}</p></body></html>`;
}

// Where Amazon redirects the seller's browser after they approve
// self-authorization from Developer Central. No Nestora Pulse session
// exists on this request (it's a fresh navigation from Amazon's own
// domain), so this uses the service-role key directly, same pattern as
// /api/cron/sync-channels.
//
// Assumes a single real Amazon-connected tenant for now (there's only one
// AMAZON3P channel row today) - revisit if a second tenant ever connects
// its own Amazon account, since `state` isn't currently used to
// disambiguate which tenant initiated this (Amazon's self-authorization
// flow generates `state` itself; we don't control it).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { spapi_oauth_code: code, selling_partner_id: sellingPartnerId, error, error_description } = req.query;

  if (error) {
    res.status(400).send(page('Authorization failed', String(error_description || error), false));
    return;
  }

  if (!code || typeof code !== 'string') {
    res.status(400).send(page('Authorization failed', 'Missing spapi_oauth_code from Amazon.', false));
    return;
  }

  if (!serviceRoleKey) {
    res.status(500).send(page('Setup incomplete', 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.', false));
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const redirectUri = `https://${req.headers.host}/api/amazon/oauth-callback`;
    const tokenResponse = await exchangeAmazonAuthCode(code, redirectUri);

    const { data: channel, error: channelError } = await admin
      .from('channels')
      .select('id, tenant_id')
      .eq('channel_name', 'AMAZON3P')
      .maybeSingle();

    if (channelError || !channel) {
      throw new Error('No AMAZON3P channel row found to attach this authorization to.');
    }

    const configs = [
      { config_key: 'refresh_token', config_value: tokenResponse.refresh_token },
      { config_key: 'selling_partner_id', config_value: String(sellingPartnerId || '') },
    ];

    for (const cfg of configs) {
      const { error: upsertError } = await admin.from('channel_configs').upsert(
        {
          tenant_id: channel.tenant_id,
          channel_id: channel.id,
          config_key: cfg.config_key,
          config_value: cfg.config_value,
          is_encrypted: false,
        },
        { onConflict: 'tenant_id,channel_id,config_key' }
      );
      if (upsertError) throw new Error(`Failed to save ${cfg.config_key}: ${upsertError.message}`);
    }

    await admin.from('sync_logs').insert({
      tenant_id: channel.tenant_id,
      channel: 'AMAZON3P',
      sync_type: 'oauth_authorize',
      status: 'success',
      error_message: `Authorized for selling_partner_id ${sellingPartnerId || 'unknown'}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

    res
      .status(200)
      .send(
        page(
          'Amazon connected',
          'Nestora Pulse is now authorized against your Amazon seller account. You can close this tab and return to the Channels page.',
          true
        )
      );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).send(page('Authorization failed', message, false));
  }
}
