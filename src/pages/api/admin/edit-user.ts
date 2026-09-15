import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ROLES = ['super_admin', 'admin', 'user'];
const ADMIN_ROLES = ['super_admin', 'admin'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!serviceRoleKey) {
    return res.status(500).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.',
    });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const { userId, full_name, role, tenant_id } = req.body as {
    userId?: string;
    full_name?: string;
    role?: string;
    tenant_id?: string;
  };

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  if (role && !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` });
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
    .select('tenant_id, role')
    .eq('id', callerUser.id)
    .single();

  if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Only admins can edit users' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: target, error: targetError } = await admin
    .from('users')
    .select('id, tenant_id, role')
    .eq('id', userId)
    .single();

  if (targetError || !target) {
    return res.status(404).json({ error: 'User not found' });
  }

  // A plain admin may only manage users in their own tenant, and can't
  // move a user to a different tenant or grant super_admin.
  if (callerProfile.role === 'admin') {
    if (target.tenant_id !== callerProfile.tenant_id) {
      return res.status(403).json({ error: "Admins can only edit users in their own tenant" });
    }
    if (tenant_id && tenant_id !== callerProfile.tenant_id) {
      return res.status(403).json({ error: 'Admins cannot move a user to a different tenant' });
    }
    if (role === 'super_admin') {
      return res.status(403).json({ error: 'Only a super admin can grant the super admin role' });
    }
  }

  const nextRole = role || target.role;
  const nextTenantId = callerProfile.role === 'super_admin' && tenant_id ? tenant_id : target.tenant_id;

  // Last-admin protection: refuse if this change would leave the target's
  // current tenant with zero admin/super_admin users.
  const isDemotion = ADMIN_ROLES.includes(target.role) && !ADMIN_ROLES.includes(nextRole);
  const isTenantMove = nextTenantId !== target.tenant_id && ADMIN_ROLES.includes(target.role);
  if (isDemotion || isTenantMove) {
    const { count } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', target.tenant_id)
      .in('role', ADMIN_ROLES)
      .neq('id', target.id);

    if (!count || count < 1) {
      return res.status(400).json({
        error: "Can't do that - this is the last admin for this tenant. Promote someone else first.",
      });
    }
  }

  if (callerProfile.role === 'super_admin' && tenant_id) {
    const { data: tenant } = await admin.from('tenants').select('id').eq('id', tenant_id).maybeSingle();
    if (!tenant) {
      return res.status(400).json({ error: 'Unknown tenant_id' });
    }
  }

  const updatePayload: Record<string, string> = {};
  if (full_name !== undefined) updatePayload.full_name = full_name;
  if (role !== undefined) updatePayload.role = nextRole;
  if (callerProfile.role === 'super_admin' && tenant_id !== undefined) updatePayload.tenant_id = nextTenantId;

  const { error: updateError } = await admin.from('users').update(updatePayload).eq('id', userId);

  if (updateError) {
    return res.status(400).json({ error: updateError.message });
  }

  return res.status(200).json({ id: userId });
}
