import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!serviceRoleKey) {
    return res.status(500).json({
      error:
        'SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Add it to .env.local ' +
        '(local) and Vercel → Project Settings → Environment Variables (production) - ' +
        'server-side only, never as NEXT_PUBLIC_*. Get it from Supabase → Project Settings → API.',
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const { email, password, full_name, role } = req.body as {
    email?: string;
    password?: string;
    full_name?: string;
    role?: string;
  };

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'email, password, and full_name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user: callerUser },
    error: callerError,
  } = await callerClient.auth.getUser(token);

  if (callerError || !callerUser) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from('users')
    .select('tenant_id, role')
    .eq('id', callerUser.id)
    .single();

  if (callerProfileError || !callerProfile) {
    return res.status(403).json({ error: 'Could not verify caller permissions' });
  }
  if (callerProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can create users' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return res.status(400).json({ error: createError?.message || 'Failed to create auth user' });
  }

  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    tenant_id: callerProfile.tenant_id,
    email,
    full_name,
    role: role === 'admin' ? 'admin' : 'user',
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return res.status(400).json({ error: `Failed to create user profile: ${profileError.message}` });
  }

  return res.status(200).json({ id: created.user.id, email });
}
