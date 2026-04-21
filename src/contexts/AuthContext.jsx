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
  const [isEmployee, setIsEmployee] = useState(false);
  const [employeeModules, setEmployeeModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const normalizeModule = (moduleName) => String(moduleName || '').trim().toLowerCase();

  const fetchEmployeeModules = async (userId) => {
    if (!userId) {
      setIsEmployee(false);
      setEmployeeModules([]);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('get_my_employee_modules');
      if (error) {
        console.error('fetchEmployeeModules error:', error);
        setIsEmployee(false);
        setEmployeeModules([]);
        return;
      }
      // get_my_employee_modules returns SETOF text → PostgREST gives ["mod1","mod2",...]
      // Guard against both flat string arrays and legacy [{get_my_employee_modules:"mod"}] shapes
      let rawList = [];
      if (Array.isArray(data)) {
        rawList = data.map((item) =>
          typeof item === 'string' ? item : (item?.get_my_employee_modules ?? '')
        );
      }
      const modules = [...new Set(rawList.map(normalizeModule).filter(Boolean))];
      setIsEmployee(modules.length > 0);
      setEmployeeModules(modules);
    } catch (err) {
      console.error('fetchEmployeeModules exception:', err);
      setIsEmployee(false);
      setEmployeeModules([]);
    }
  };

  const fetchProfile = async (userId, sessionUser) => {
    if (!userId) {
      setProfile(null);
      setIsAdmin(false);
      setIsSeller(false);
      setIsEmployee(false);
      setEmployeeModules([]);
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
        const meta = sessionUser?.user_metadata ?? {};
        setIsAdmin(meta.is_admin === true || meta.role === 'admin');
        setIsSeller(meta.is_seller === true || meta.role === 'seller');
        await fetchEmployeeModules(userId);
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
            if (!updated.is_admin) {
              setIsEmployee(updated.is_employee === true);
              await fetchEmployeeModules(userId);
            } else {
              setIsEmployee(false);
              setEmployeeModules([]);
            }
            return;
          }
        }
        setProfile(data);
        setIsAdmin(data.is_admin === true);
        setIsSeller(data.is_seller === true);
        if (!data.is_admin) {
          // Set isEmployee from the profile flag immediately (fast),
          // then fetch actual modules for hasModule() checks
          setIsEmployee(data.is_employee === true);
          await fetchEmployeeModules(userId);
        } else {
          setIsEmployee(false);
          setEmployeeModules([]);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        setIsEmployee(false);
        setEmployeeModules([]);
      }
    } catch (err) {
      console.error('Exception fetching profile:', err);
      setProfile(null);
      const meta = sessionUser?.user_metadata ?? {};
      setIsAdmin(meta.is_admin === true || meta.role === 'admin');
      setIsSeller(meta.is_seller === true || meta.role === 'seller');
      await fetchEmployeeModules(userId);
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

  const signIn = async (email, password, rememberMe = true) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
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
    isEmployee,
    employeeModules,
    hasModule: (mod) => isAdmin || employeeModules.includes(normalizeModule(mod)),
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
