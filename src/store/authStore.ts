import { create } from 'zustand';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthStore {
  user: User | null;
  tenantId: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setTenantId: (tenantId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Auth methods
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName: string, tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  tenantId: null,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),
  setTenantId: (tenantId) => set({ tenantId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  login: async (email, password) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.user) throw new Error('Login succeeded but no user returned');

      // Fetch tenant_id from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', data.user.id)
        .single();

      if (userError) throw userError;

      set({ user: data.user, tenantId: userData.tenant_id, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  signup: async (email, password, fullName, tenantId) => {
    try {
      set({ isLoading: true, error: null });

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) throw authError;
      if (!authData.user?.id) throw new Error('Signup succeeded but no user ID returned');

      // Create users table entry
      // Note: `is_active` is intentionally not sent - the users table has
      // no such column, and inserting it here was causing every signup's
      // profile-creation step to fail.
      const { error: dbError } = await supabase.from('users').insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        tenant_id: tenantId,
        role: 'admin',
      });

      if (dbError) {
        // Note: we can't clean up the just-created auth user from here -
        // supabase.auth.admin.* requires the service-role key, which must
        // never be used client-side (it was being called with the anon
        // key, which always fails and was masking the real dbError below
        // behind a generic "Signup failed"). A failed profile insert
        // leaves an orphaned auth.users row; an admin can remove it from
        // the Supabase dashboard if that happens.
        throw new Error(`Failed to create user profile: ${dbError.message}`);
      }

      set({ user: authData.user, tenantId, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      set({ isLoading: true, error: null });
      await supabase.auth.signOut();
      set({ user: null, tenantId: null, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Logout failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  checkAuth: async () => {
    try {
      set({ isLoading: true });

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        set({ user: null, tenantId: null, isLoading: false });
        return;
      }

      // Fetch tenant_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      set({ user, tenantId: userData.tenant_id, isLoading: false });
    } catch (err) {
      set({ user: null, tenantId: null, isLoading: false });
    }
  },
}));
