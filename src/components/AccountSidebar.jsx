import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AccountSidebar() {
  const { user, profile, isAdmin, isEmployee, isSeller, employeeModules, signOut } = useAuth();
  const location = useLocation();

  // Pick the best landing route for the employee based on their first module
  const MODULE_ROUTES = {
    orders:    '/admin/orders',
    logistics: '/admin/logistics',
    support:   '/admin/support',
    inventory: '/admin/inventory',
    coupons:   '/admin/coupons',
    customers: '/admin',
    sellers:   '/admin/sellers',
    products:  '/admin',
    lots:      '/admin',
    recipes:   '/admin',
  };
  const staffRoute = employeeModules.reduce((found, mod) => {
    if (found) return found;
    return MODULE_ROUTES[String(mod || '').trim().toLowerCase()] || null;
  }, null) || '/admin';

  const links = [
    { label: 'Profile',   href: '/profile',  icon: 'person' },
    { label: 'Orders',    href: '/orders',   icon: 'package_2' },
    { label: 'Support',   href: '/support',  icon: 'support_agent' },
    { label: 'Wishlist',  href: '/wishlist', icon: 'favorite' },
    ...(isSeller
      ? [{ label: 'Seller', href: '/seller', icon: 'storefront', special: true }]
      : []),
    ...(isAdmin
      ? [{ label: 'Admin', href: '/admin', icon: 'admin_panel_settings', special: true }]
      : []),
    ...(!isAdmin && isEmployee
      ? [{ label: 'Staff Panel', href: staffRoute, icon: 'badge', special: true }]
      : []),
  ];

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/';
  };

  const fullName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User'
    : '';

  return (
    <aside className="space-y-4 lg:sticky lg:top-36 lg:self-start">
      {/* Profile card */}
      {profile && (
        <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-outline-variant/15">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/8 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-xl">account_circle</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-headline text-sm font-bold text-on-surface truncate">{fullName}</p>
            <p className="text-[11px] text-on-surface-variant/50 font-body truncate">
              {profile.email || user?.email}
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex flex-row lg:flex-col gap-1 flex-wrap">
        {links.map(link => {
          const active = location.pathname.startsWith(link.href) &&
            (link.href !== '/' || location.pathname === '/');
          return (
            <Link
              key={link.label}
              to={link.href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-body text-sm ${
                active
                  ? 'bg-primary text-white font-semibold'
                  : `hover:bg-surface-container-low ${
                      link.special
                        ? 'text-secondary font-semibold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`
              }`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {link.icon}
              </span>
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          );
        })}

        <div className="pt-2 mt-1 border-t border-outline-variant/10 w-full">
          <button
            onClick={handleLogout}
            className="group flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all hover:bg-red-50 text-red-500/70 hover:text-red-600 font-body text-sm text-left active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </nav>

      {/* Help card */}
      <div className="hidden lg:block bg-surface-container-low rounded-lg p-4 border border-outline-variant/10">
        <p className="text-sm font-semibold text-on-surface font-headline mb-1">Need help?</p>
        <p className="text-xs text-on-surface-variant/60 font-body mb-3 leading-relaxed">
          Our team is available to assist with your orders.
        </p>
        <Link to="/contact">
          <button className="w-full bg-primary text-white px-4 py-2 rounded-lg text-xs font-semibold font-headline transition-all hover:bg-primary/90 active:scale-[0.98] flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">mail</span>
            Contact
          </button>
        </Link>
      </div>
    </aside>
  );
}
