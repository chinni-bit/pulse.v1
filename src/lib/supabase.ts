import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get current authenticated user session
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get user's tenant_id from database (users table)
 * This enforces multi-tenant isolation at the app level
 */
export async function getUserTenant(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', userId)
    .single();

  if (error) throw new Error(`Failed to fetch user tenant: ${error.message}`);
  return data.tenant_id;
}

/**
 * Sign up with email and password
 * Creates auth.users entry and users table entry
 */
export async function signUp(email: string, password: string, fullName: string, tenantId: string) {
  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) throw new Error(`Sign up failed: ${authError.message}`);
  if (!authData.user?.id) throw new Error('Sign up succeeded but no user ID returned');

  // 2. Create users table entry (app-level multi-tenant)
  const { error: dbError } = await supabase
    .from('users')
    .insert({
      id: authData.user.id,
      email,
      full_name: fullName,
      tenant_id: tenantId,
      role: 'admin', // First user is admin
      is_active: true,
    });

  if (dbError) {
    // Clean up auth user if DB insert fails
    await supabase.auth.admin.deleteUser(authData.user.id);
    throw new Error(`Failed to create user profile: ${dbError.message}`);
  }

  return authData.user;
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(`Sign in failed: ${error.message}`);
  return data;
}

/**
 * Sign out current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Sign out failed: ${error.message}`);
}

/**
 * Reset password with email
 */
export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  });

  if (error) throw new Error(`Password reset failed: ${error.message}`);
}

/**
 * Update password (requires current session)
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) throw new Error(`Password update failed: ${error.message}`);
}