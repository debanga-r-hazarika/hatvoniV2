import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cartService } from '../services/cartService';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About Us' },
  { to: '/products', label: 'Our Products' },
  { to: '/traditions', label: 'Traditions' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact Us' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [cartCount, setCartCount] = useState(() => cartService.getCartCount());
  const { user, profile, isAdmin, isSeller, signOut } = useAuth();
  const navigate = useNavigate();

  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const navRef = useRef(null);

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY.current;

    setScrolled(currentScrollY > 10);

    if (currentScrollY > 80) {
      if (scrollDelta > 5 && !menuOpen) {
        setHidden(true);
      } else if (scrollDelta < -5) {
        setHidden(false);
      }
    } else {
      setHidden(false);
    }

    lastScrollY.current = currentScrollY;
    ticking.current = false;
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(handleScroll);
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [handleScroll]);

  const closeMenu = useCallback(() => {
    if (menuOpen) {
      setIsClosing(true);
      setTimeout(() => {
        setMenuOpen(false);
        setIsClosing(false);
      }, 280);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const unsubscribe = cartService.subscribe(() => {
      setCartCount(cartService.getCartCount());
    });
    return unsubscribe;
  }, []);

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      setMenuOpen(true);
    }
  };

  const handleSignOut = async () => {
    closeMenu();
    await signOut();
    navigate('/');
  };

  const getUserDisplayName = () => {
    if (profile?.first_name) {
      return profile.first_name;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'User';
  };

  const handleLinkClick = () => {
    closeMenu();
  };

  return (
    <>
      <header
        ref={navRef}
        className={`fixed top-0 w-full z-50 transition-all duration-500 ease-out ${
          hidden ? '-translate-y-full' : 'translate-y-0'
        } ${
          scrolled
            ? 'bg-white/95 backdrop-blur-xl shadow-sm'
            : 'bg-transparent'
        }`}
        style={{ willChange: 'transform, background-color' }}
      >
        <nav className="flex justify-between items-center px-6 md:px-12 py-4 md:py-5 w-full max-w-screen-2xl mx-auto">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span
              className="text-2xl md:text-3xl font-bold tracking-tight"
              style={{ fontFamily: "'Rammetto One', sans-serif", color: '#004a2b' }}
            >
              Hatvoni
            </span>
          </Link>

          {/* Desktop nav links — Inter Medium, #004a2b, 19px */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `relative px-3 py-2 rounded-lg transition-all duration-200 text-[19px] font-medium ${
                    isActive
                      ? 'text-[#004a2b]'
                      : 'text-[#004a2b]/80 hover:text-[#004a2b] hover:bg-[#004a2b]/5'
                  }`
                }
                style={{ fontFamily: "'Inter', sans-serif" }}
                end={link.to === '/'}
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4/5 bg-[#004a2b] rounded-full" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center space-x-1">
            <Link
              to="/wishlist"
              className="relative p-2.5 text-[#004a2b] hover:bg-[#004a2b]/5 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 group"
            >
              <span className="material-symbols-outlined text-xl transition-transform duration-300 group-hover:scale-110">favorite</span>
            </Link>
            <Link
              to="/cart"
              className="relative p-2.5 text-[#004a2b] hover:bg-[#004a2b]/5 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 group"
            >
              <span className="material-symbols-outlined text-xl transition-transform duration-300 group-hover:scale-110">shopping_cart</span>
              <span className="absolute top-0.5 right-0.5 bg-[#fcb748] text-white text-[9px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center font-bold">{cartCount}</span>
            </Link>

            {user ? (
              <>
                <div className="hidden md:flex items-center space-x-2 ml-3">
                  {isAdmin && (
                    <>
                      <Link
                        to="/admin"
                        className="px-4 py-2 text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-all duration-300 active:scale-95"
                        style={{ fontFamily: "'Inter', sans-serif" }}
                      >
                        Admin
                      </Link>
                      <Link
                        to="/admin/coupons"
                        className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-all duration-300 active:scale-95"
                        style={{ fontFamily: "'Inter', sans-serif" }}
                      >
                        Coupons
                      </Link>
                    </>
                  )}
                  {isSeller && (
                    <Link
                      to="/seller"
                      className="px-4 py-2 text-sm font-medium bg-primary text-white hover:opacity-90 rounded-lg transition-all duration-300 active:scale-95"
                      style={{ fontFamily: "'Inter', sans-serif" }}
                    >
                      Seller Panel
                    </Link>
                  )}
                  <Link
                    to="/profile"
                    className="flex items-center space-x-2 px-3 py-2 hover:bg-[#004a2b]/5 rounded-lg transition-all duration-300 group"
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-[#004a2b]/20" />
                    ) : (
                      <span className="material-symbols-outlined text-xl text-[#004a2b]">person</span>
                    )}
                    <span className="text-sm font-medium text-[#004a2b]" style={{ fontFamily: "'Inter', sans-serif" }}>{getUserDisplayName()}</span>
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 text-sm font-medium text-[#004a2b] hover:bg-[#004a2b]/5 rounded-lg transition-all duration-300 active:scale-95"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    Logout
                  </button>
                </div>
                <Link
                  to="/profile"
                  className="md:hidden p-2.5 text-[#004a2b] hover:bg-[#004a2b]/5 rounded-full transition-all duration-300"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-xl">person</span>
                  )}
                </Link>
              </>
            ) : (
              <div className="hidden md:flex items-center space-x-2 ml-3">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-[#004a2b] hover:bg-[#004a2b]/5 rounded-lg transition-all duration-300 active:scale-95"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 text-sm font-medium bg-[#004a2b] text-white hover:bg-[#003820] rounded-lg transition-all duration-300 active:scale-95"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  Sign Up
                </Link>
              </div>
            )}

            <button
              className="md:hidden p-2.5 text-[#004a2b] hover:bg-[#004a2b]/5 rounded-full transition-all duration-300 active:scale-95"
              onClick={toggleMenu}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <span className={`material-symbols-outlined transition-transform duration-300 ${menuOpen && !isClosing ? 'rotate-90' : 'rotate-0'}`}>
                {menuOpen && !isClosing ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </nav>
      </header>

      {(menuOpen || isClosing) && (
        <>
          <div
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
              isClosing ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={closeMenu}
            aria-hidden="true"
          />

          <div
            className={`fixed top-0 right-0 h-full w-[85%] max-w-sm bg-surface z-50 md:hidden shadow-2xl transition-transform duration-300 ease-out ${
              isClosing ? 'translate-x-full' : 'translate-x-0'
            }`}
            style={{ willChange: 'transform' }}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/30">
                <Link
                  to="/"
                  onClick={handleLinkClick}
                  className="font-display text-2xl text-primary tracking-tighter"
                >
                  Hatvoni
                </Link>
                <button
                  onClick={closeMenu}
                  className="p-2 text-primary hover:bg-surface-container-low rounded-full transition-all duration-300"
                  aria-label="Close menu"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-6">
                <nav className="space-y-1">
                  {navLinks.map((link, index) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      className={({ isActive }) =>
                        `flex items-center px-4 py-3.5 rounded-xl font-body tracking-tight text-base transition-all duration-300 ${
                          isActive
                            ? 'text-secondary bg-secondary/10 font-bold'
                            : 'text-primary/80 hover:bg-surface-container-low hover:text-primary'
                        }`
                      }
                      onClick={handleLinkClick}
                      end={link.to === '/'}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                        opacity: isClosing ? 1 : 0,
                      }}
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </nav>

                <div className="mt-8 pt-6 border-t border-outline-variant/30 space-y-1">
                  <Link
                    to="/wishlist"
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-primary font-body font-semibold text-sm hover:bg-surface-container-low transition-all duration-300"
                    style={{
                      animationDelay: `${navLinks.length * 50}ms`,
                      animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                      opacity: isClosing ? 1 : 0,
                    }}
                  >
                    <span className="material-symbols-outlined text-lg">favorite</span>
                    Wishlist
                  </Link>
                  <Link
                    to="/cart"
                    onClick={handleLinkClick}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-primary font-body font-semibold text-sm hover:bg-surface-container-low transition-all duration-300"
                    style={{
                      animationDelay: `${(navLinks.length + 1) * 50}ms`,
                      animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                      opacity: isClosing ? 1 : 0,
                    }}
                  >
                    <span className="material-symbols-outlined text-lg">shopping_cart</span>
                    Cart
                    <span className="ml-auto bg-secondary text-white text-xs px-2 py-0.5 rounded-full font-bold">{cartCount}</span>
                  </Link>
                </div>

                <div className="mt-6 pt-6 border-t border-outline-variant/30 space-y-1">
                  {user ? (
                    <>
                      {isAdmin && (
                        <>
                          <Link
                            to="/admin"
                            onClick={handleLinkClick}
                            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-amber-500 text-white font-body font-semibold text-sm hover:bg-amber-600 transition-all duration-300"
                            style={{
                              animationDelay: `${(navLinks.length + 2) * 50}ms`,
                              animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                              opacity: isClosing ? 1 : 0,
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
                            Admin Dashboard
                          </Link>
                          <Link
                            to="/admin/coupons"
                            onClick={handleLinkClick}
                            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-emerald-600 text-white font-body font-semibold text-sm hover:bg-emerald-700 transition-all duration-300"
                            style={{
                              animationDelay: `${(navLinks.length + 3) * 50}ms`,
                              animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                              opacity: isClosing ? 1 : 0,
                            }}
                          >
                            <span className="material-symbols-outlined text-lg">sell</span>
                            Manage Coupons
                          </Link>
                        </>
                      )}
                      {isSeller && (
                        <Link
                          to="/seller"
                          onClick={handleLinkClick}
                          className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-primary text-white font-body font-semibold text-sm hover:opacity-90 transition-all duration-300"
                          style={{
                            animationDelay: `${(navLinks.length + 2) * 50}ms`,
                            animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                            opacity: isClosing ? 1 : 0,
                          }}
                        >
                          <span className="material-symbols-outlined text-lg">storefront</span>
                          Seller Panel
                        </Link>
                      )}
                      <Link
                        to="/profile"
                        onClick={handleLinkClick}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-primary font-body font-semibold text-sm hover:bg-surface-container-low transition-all duration-300"
                        style={{
                          animationDelay: `${(navLinks.length + 4) * 50}ms`,
                          animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                          opacity: isClosing ? 1 : 0,
                        }}
                      >
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover ring-2 ring-primary/20" />
                        ) : (
                          <span className="material-symbols-outlined text-lg">person</span>
                        )}
                        Profile
                      </Link>
                      <Link
                        to="/orders"
                        onClick={handleLinkClick}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-primary font-body font-semibold text-sm hover:bg-surface-container-low transition-all duration-300"
                        style={{
                          animationDelay: `${(navLinks.length + 5) * 50}ms`,
                          animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                          opacity: isClosing ? 1 : 0,
                        }}
                      >
                        <span className="material-symbols-outlined text-lg">package_2</span>
                        Orders
                      </Link>
                      <button
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 px-4 py-3.5 rounded-xl text-primary font-body font-semibold text-sm hover:bg-surface-container-low transition-all duration-300 text-left"
                        style={{
                          animationDelay: `${(navLinks.length + 6) * 50}ms`,
                          animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                          opacity: isClosing ? 1 : 0,
                        }}
                      >
                        <span className="material-symbols-outlined text-lg">logout</span>
                        Logout
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        onClick={handleLinkClick}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-primary font-body font-semibold text-sm hover:bg-surface-container-low transition-all duration-300"
                        style={{
                          animationDelay: `${(navLinks.length + 2) * 50}ms`,
                          animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                          opacity: isClosing ? 1 : 0,
                        }}
                      >
                        <span className="material-symbols-outlined text-lg">login</span>
                        Login
                      </Link>
                      <Link
                        to="/signup"
                        onClick={handleLinkClick}
                        className="flex items-center justify-center gap-2 px-4 py-3.5 mt-2 rounded-xl bg-secondary text-white font-body font-semibold text-sm hover:bg-secondary/90 transition-all duration-300"
                        style={{
                          animationDelay: `${(navLinks.length + 3) * 50}ms`,
                          animation: isClosing ? 'none' : 'slideInRight 0.3s ease-out forwards',
                          opacity: isClosing ? 1 : 0,
                        }}
                      >
                        Sign Up
                      </Link>
                    </>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-outline-variant/30">
                <p className="text-xs text-primary/50 text-center font-body">
                  Premium Kosher Products
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
