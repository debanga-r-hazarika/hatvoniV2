import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function AccountSidebar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        .then(({data}) => { 
            if (data) setProfile({...data, email: user.email || data.email});
        });
    }
  }, [user]);

  const links = [
    { label: 'Personal Profile', href: '/profile', icon: 'person' },
    { label: 'Order History', href: '/orders', icon: 'package_2' },
    { label: 'My Wishlist', href: '/wishlist', icon: 'favorite' },
    ...(profile?.is_seller ? [{ label: 'Seller Panel', href: '/seller', icon: 'storefront', admin: true }] : []),
    ...(profile?.is_admin ? [{ label: 'Admin Panel', href: '/admin', icon: 'admin_panel_settings', admin: true }] : []),
  ];

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <aside className="space-y-6 lg:sticky lg:top-40 lg:self-start pt-2">
      {profile && (
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-5 flex items-center gap-4 shadow-sm relative overflow-hidden group">
           <div className="absolute inset-0 bg-gradient-to-tr from-secondary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
           {profile.avatar_url ? (
               <img src={profile.avatar_url} alt="Avatar" className="w-14 h-14 rounded-full object-cover shadow-sm border border-outline-variant/20 relative z-10" />
           ) : (
               <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary relative z-10">
                 <span className="material-symbols-outlined text-3xl">account_circle</span>
               </div>
           )}
           <div className="min-w-0 flex-1 relative z-10">
              <p className="font-brand text-2xl text-primary truncate leading-[0.9]">
                 {profile.first_name || profile.last_name ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'User Profile'}
              </p>
              <p className="text-xs font-medium text-on-surface-variant truncate tracking-wide">{profile.email}</p>
           </div>
        </div>
      )}

      <div>
        <nav className="flex flex-row lg:flex-col gap-2 flex-wrap">
          {links.map(link => {
            const active = location.pathname.startsWith(link.href) && (link.href !== '/' || location.pathname === '/');
            return (
              <Link key={link.label} to={link.href}
                className={`group flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-semibold text-sm ${
                  active 
                    ? 'bg-primary text-white shadow-md scale-[1.02]' 
                    : `hover:bg-surface-container-lowest border border-transparent ${link.admin ? 'text-secondary hover:border-secondary/20' : 'text-on-surface-variant hover:border-outline-variant/30'}`
                }`}>
                <span className="material-symbols-outlined text-[20px]" style={active ? { fontVariationSettings: "'FILL' 1" } : {}}>{link.icon}</span>
                <span className="hidden sm:inline tracking-wide">{link.label}</span>
              </Link>
            );
          })}
          
          <div className="pt-4 mt-2 border-t border-outline-variant/20 w-full">
            <button
              onClick={handleLogout}
              className="group flex items-center gap-4 px-5 py-4 w-full rounded-2xl transition-all hover:bg-red-50 text-red-600 font-semibold text-sm text-left active:scale-95"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span className="hidden sm:inline tracking-wide">Sign Out</span>
            </button>
          </div>
        </nav>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/30 p-6 rounded-3xl relative overflow-hidden hidden lg:block shadow-sm group">
        <div className="relative z-10">
          <h4 className="font-brand text-primary text-3xl leading-[0.9] mb-2 tracking-tight">Need help?</h4>
          <p className="text-xs text-on-surface-variant font-medium mb-5 leading-relaxed">Our heritage experts are available to assist with your orders.</p>
          <Link to="/contact" className="block">
            <button className="bg-secondary text-white px-5 py-3 w-full rounded-2xl text-[11px] font-bold uppercase tracking-widest transition-all hover:bg-secondary/90 active:scale-95 shadow-md flex items-center justify-center gap-2">
               <span className="material-symbols-outlined text-[16px]">mail</span> Contact Support
            </button>
          </Link>
        </div>
        <span className="material-symbols-outlined absolute -right-6 -bottom-6 text-primary/5 text-[120px] rotate-12 group-hover:scale-110 transition-transform select-none">support_agent</span>
      </div>
    </aside>
  );
}
