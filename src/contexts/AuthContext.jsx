import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId, sessionUser) => {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      setIsSeller(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        return;
      }

      if (data) {
        const meta = sessionUser?.user_metadata ?? {};
        const googleFirstName = meta.given_name || meta.first_name || (meta.full_name || meta.name || '').split(' ')[0] || '';
        const googleLastName = meta.family_name || meta.last_name
          || (() => { const parts = (meta.full_name || meta.name || '').split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : ''; })();
        const googleAvatar = meta.avatar_url || meta.picture || '';

        const needsUpdate =
          (!data.avatar_url && googleAvatar) ||
          (!data.first_name && googleFirstName) ||
          (!data.last_name && googleLastName);

        if (needsUpdate) {
          const patch = { updated_at: new Date().toISOString() };
          if (!data.avatar_url && googleAvatar) patch.avatar_url = googleAvatar;
          if (!data.first_name && googleFirstName) patch.first_name = googleFirstName;
          if (!data.last_name && googleLastName) patch.last_name = googleLastName;

          const { data: updated } = await supabase
            .from('profiles')
            .update(patch)
            .eq('id', userId)
            .select()
            .maybeSingle();
          if (updated) {
            setProfile(updated);
            setIsAdmin(updated.is_admin === true);
            setIsSeller(updated.is_seller === true);
            return;
          }
        }
        setProfile(data);
        setIsAdmin(data.is_admin === true);
        setIsSeller(data.is_seller === true);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
      }
    } catch (err) {
      console.error('Exception fetching profile:', err);
      setProfile(null);
      setIsAdmin(false);
      setIsSeller(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      await fetchProfile(session?.user?.id, session?.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        setUser(session?.user ?? null);
        await fetchProfile(session?.user?.id, session?.user);
        setLoading(false);

        // Customer sync is handled server-side by DB triggers.
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email, password, userData = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
        emailRedirectTo: `${window.location.origin}/confirm-account`
      }
    });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    return { data, error };
  };

  const updatePassword = async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { data, error };
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });
    return { data, error };
  };

  const value = {
    user,
    profile,
    isAdmin,
    isSeller,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    signInWithGoogle,
    refreshProfile: () => fetchProfile(user?.id, user)
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
