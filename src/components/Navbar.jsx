import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cartService } from '../services/cartService';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/products', label: 'Shop' },
  { to: '/about', label: 'Story' },
  { to: '/traditions', label: 'Traditions' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [cartCount, setCartCount] = useState(() => cartService.getCartCount());
  const { user, profile, isAdmin, isEmployee, isSeller, signOut } = useAuth();
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
        className={`fixed top-0 w-full z-50 transition-all duration-500 ease-out font-body ${
          hidden ? '-translate-y-full' : 'translate-y-0'
        }`}
        style={{ willChange: 'transform' }}
      >
        {/* Top Announcement Bar */}
        <div className="bg-primary text-white py-1.5 px-4 text-center text-xs tracking-wide border-b border-primary-fixed/20 relative z-10 hidden sm:block">
          Discover the Authentic Heritage & Flavors of Northeast India
        </div>

        {/* Main Navbar */}
        <div 
          className={`w-full transition-all duration-500 ${
            scrolled
              ? 'bg-surface/90 backdrop-blur-md shadow-sm border-b border-outline-variant/30 py-3'
              : 'bg-surface py-4 md:py-6'
          }`}
        >
          <nav className="flex justify-between items-center px-4 md:px-8 xl:px-12 w-full max-w-screen-2xl mx-auto">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity z-10"
            >
              <span className="text-2xl md:text-4xl font-bold tracking-tight font-brand text-primary leading-[0.9]">
                 Hatvoni
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden lg:flex items-center gap-2 xl:gap-4 absolute left-1/2 -translate-x-1/2">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `relative px-3 py-2 rounded-full transition-all duration-300 text-[14px] xl:text-[15px] font-medium tracking-wide ${
                      isActive
                        ? 'text-primary'
                        : 'text-primary/70 hover:text-primary hover:bg-primary/5'
                    }`
                  }
                  end={link.to === '/'}
                >
                  {({ isActive }) => (
                    <>
                      {link.label}
                      {isActive && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-[3px] w-1 bg-secondary rounded-full" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            {/* Icons & Utility */}
            <div className="flex items-center space-x-1 md:space-x-3 z-10">
              <div className="hidden sm:flex space-x-2">
                <Link
                  to="/wishlist"
                  className="relative p-2.5 text-primary/80 hover:text-primary hover:bg-primary/5 rounded-full transition-all duration-300 active:scale-95 group"
                  aria-label="Wishlist"
                >
                  <span className="material-symbols-outlined text-[24px] transition-transform duration-300 group-hover:scale-110">favorite</span>
                </Link>
                <Link
                  to="/cart"
                  className="relative p-2.5 text-primary/80 hover:text-primary hover:bg-primary/5 rounded-full transition-all duration-300 active:scale-95 group"
                  aria-label="Cart"
                >
                  <span className="material-symbols-outlined text-[24px] transition-transform duration-300 group-hover:scale-110">shopping_cart</span>
                  {cartCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 bg-secondary-container text-on-secondary-container text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center font-bold border-2 border-surface shadow-sm">
                      {cartCount}
                    </span>
                  )}
                </Link>
              </div>

              {/* User / Auth Section */}
              {user ? (
                <>
                  <div className="hidden md:flex items-center space-x-4 ml-4 border-l border-outline-variant/40 pl-6">
                    {(isAdmin || isEmployee) && (
                      <Link
                        to="/admin"
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-amber-500 text-white hover:bg-amber-600 rounded-full transition-all duration-300 shadow-sm hover:shadow active:scale-95 hidden xl:block"
                      >
                        {isAdmin ? 'Admin' : 'Staff'}
                      </Link>
                    )}
                    {isSeller && (
                      <Link
                        to="/seller"
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider border border-primary text-primary hover:bg-primary hover:text-white rounded-full transition-all duration-300 active:scale-95 hidden xl:block"
                      >
                        Seller
                      </Link>
                    )}
                    <div className="relative group">
                      <Link
                        to="/profile"
                        className="flex items-center gap-2 px-1.5 py-1.5 pr-4 hover:bg-primary/5 rounded-full border border-transparent hover:border-outline-variant/30 transition-all duration-300"
                      >
                        {profile?.avatar_url ? (
                          <img src={profile.avatar_url} alt="Profile" className="w-8 h-8 rounded-full object-cover shadow-sm" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center text-primary/70">
                            <span className="material-symbols-outlined text-[20px]">person</span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-primary hidden lg:block truncate max-w-[120px]">{getUserDisplayName()}</span>
                      </Link>
                    </div>
                  </div>

                  {/* Mobile Icons */}
                  <div className="flex sm:hidden items-center ml-2">
                    <Link
                      to="/cart"
                      className="relative p-2 text-primary/80 hover:text-primary rounded-full transition-all duration-300"
                    >
                      <span className="material-symbols-outlined text-[22px]">shopping_cart</span>
                      {cartCount > 0 && (
                        <span className="absolute top-1 right-0 bg-secondary-container text-on-secondary-container text-[9px] min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center font-bold">
                          {cartCount}
                        </span>
                      )}
                    </Link>
                  </div>
                </>
              ) : (
                <div className="hidden md:flex items-center space-x-3 ml-4 border-l border-outline-variant/40 pl-6">
                  <Link
                     to="/login"
                     className="text-sm font-medium text-primary hover:text-primary/70 transition-colors duration-300 px-3 py-2"
                  >
                     Log In
                  </Link>
                  <Link
                    to="/signup"
                    className="px-5 py-2.5 text-sm font-semibold bg-primary text-white hover:bg-primary/90 rounded-full transition-all duration-300 shadow-sm hover:shadow-md active:scale-95"
                  >
                    Join Us
                  </Link>
                </div>
              )}

              {/* Mobile Menu Toggle */}
              <button
                className="lg:hidden p-2 text-primary hover:bg-primary/5 rounded-full transition-all duration-300 active:scale-95 ml-2"
                onClick={toggleMenu}
                aria-label="Toggle menu"
                aria-expanded={menuOpen}
              >
                <div className="w-[22px] h-[16px] flex flex-col justify-between items-end relative">
                  <span className={`h-[2px] bg-primary rounded-full transition-all duration-300 absolute w-full ${menuOpen ? 'rotate-45 top-1/2 -translate-y-1/2' : 'top-0'}`} />
                  <span className={`h-[2px] bg-primary rounded-full transition-all duration-200 absolute w-[80%] top-1/2 -translate-y-1/2 ${menuOpen ? 'opacity-0 translate-x-2' : ''}`} />
                  <span className={`h-[2px] bg-primary rounded-full transition-all duration-300 absolute w-full ${menuOpen ? '-rotate-45 top-1/2 -translate-y-1/2' : 'bottom-0'}`} />
                </div>
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {(menuOpen || isClosing) && (
        <>
          <div
            className={`fixed inset-0 bg-scrim/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-400 ease-in-out ${
              isClosing ? 'opacity-0' : 'opacity-100'
            }`}
            onClick={closeMenu}
            aria-hidden="true"
          />

          <div
            className={`fixed top-0 right-0 h-[100dvh] w-[85%] max-w-[360px] bg-surface z-50 lg:hidden flex flex-col shadow-[rgba(0,0,0,0.1)_0px_10px_50px] transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isClosing ? 'translate-x-full' : 'translate-x-0'
            }`}
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-primary/10 bg-surface">
              <Link
                to="/"
                onClick={handleLinkClick}
                className="font-brand text-3xl text-primary tracking-tighter leading-none"
              >
                Hatvoni
              </Link>
              <button
                onClick={closeMenu}
                className="w-10 h-10 text-primary/70 hover:text-primary hover:bg-surface-container rounded-full transition-all duration-300 flex items-center justify-center -mr-2 bg-surface"
                aria-label="Close menu"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 no-scrollbar bg-surface-container-lowest">
              <nav className="flex flex-col space-y-1 mb-8">
                {navLinks.map((link, index) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      `flex items-center px-4 py-3.5 rounded-2xl font-headline tracking-wide text-[16px] transition-all duration-300 ${
                        isActive
                          ? 'text-primary bg-primary/5 font-semibold'
                          : 'text-primary/70 hover:bg-surface-container hover:text-primary'
                      }`
                    }
                    onClick={handleLinkClick}
                    end={link.to === '/'}
                    style={{
                      animationDelay: `${index * 40}ms`,
                      animation: isClosing ? 'none' : 'slideInRight 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
                      opacity: isClosing ? 1 : 0,
                    }}
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>

              <div className="pt-6 border-t border-primary/10 flex flex-col space-y-2">
                <div className="text-[10px] font-bold text-primary/40 uppercase tracking-widest px-4 mb-2">Shopping</div>
                <Link
                  to="/wishlist"
                  onClick={handleLinkClick}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-primary font-body text-sm hover:bg-surface-container transition-all duration-300"
                  style={{ animationDelay: '200ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                >
                  <span className="material-symbols-outlined text-[20px] text-primary/60">favorite</span>
                  Wishlist
                </Link>
                <Link
                  to="/cart"
                  onClick={handleLinkClick}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl text-primary font-body text-sm hover:bg-surface-container transition-all duration-300"
                  style={{ animationDelay: '240ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                >
                  <span className="material-symbols-outlined text-[20px] text-primary/60">shopping_cart</span>
                  Shopping Cart
                  {cartCount > 0 && <span className="ml-auto bg-secondary-container text-on-secondary-container text-xs px-2.5 py-0.5 rounded-full font-bold">{cartCount}</span>}
                </Link>
              </div>

              <div className="mt-6 pt-6 border-t border-primary/10 flex flex-col space-y-2">
                <div className="text-[10px] font-bold text-primary/40 uppercase tracking-widest px-4 mb-2">Account</div>
                {user ? (
                  <>
                    {(isAdmin || isEmployee) && (
                      <Link
                        to="/admin"
                        onClick={handleLinkClick}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 text-amber-700 font-body text-sm font-semibold hover:bg-amber-500/20 transition-all duration-300"
                        style={{ animationDelay: '280ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                      >
                        <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                        {isAdmin ? 'Admin Dashboard' : 'Staff Dashboard'}
                      </Link>
                    )}
                    {isSeller && (
                      <Link
                        to="/seller"
                        onClick={handleLinkClick}
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-primary/10 text-primary font-body text-sm font-semibold hover:bg-primary/20 transition-all duration-300"
                        style={{ animationDelay: '300ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                      >
                        <span className="material-symbols-outlined text-[20px]">storefront</span>
                        Seller Panel
                      </Link>
                    )}
                    
                    <Link
                      to="/profile"
                      onClick={handleLinkClick}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl text-primary font-body text-sm hover:bg-surface-container transition-all duration-300"
                      style={{ animationDelay: '320ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                    >
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[20px] text-primary/60">person</span>
                      )}
                      My Profile
                    </Link>
                    <Link
                      to="/orders"
                      onClick={handleLinkClick}
                      className="flex items-center gap-3 px-4 py-3 rounded-2xl text-primary font-body text-sm hover:bg-surface-container transition-all duration-300"
                      style={{ animationDelay: '360ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                    >
                      <span className="material-symbols-outlined text-[20px] text-primary/60">package_2</span>
                      My Orders
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-3 px-4 py-3 mt-4 rounded-2xl text-error font-body text-sm font-medium bg-error/5 hover:bg-error/10 transition-all duration-300 text-left"
                      style={{ animationDelay: '400ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                    >
                      <span className="material-symbols-outlined text-[20px]">logout</span>
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={handleLinkClick}
                      className="flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl bg-surface-container text-primary font-body text-sm font-semibold hover:bg-surface-variant transition-all duration-300"
                      style={{ animationDelay: '280ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                    >
                      Log In
                    </Link>
                    <Link
                      to="/signup"
                      onClick={handleLinkClick}
                      className="flex items-center justify-center gap-2 px-4 py-3.5 mt-3 rounded-2xl bg-primary text-white font-body text-sm font-semibold hover:bg-primary/90 transition-all duration-300 shadow-md"
                      style={{ animationDelay: '320ms', animation: isClosing ? 'none' : 'fadeUp 0.4s ease forwards', opacity: isClosing ? 1 : 0 }}
                    >
                      Create an Account
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="px-6 py-5 border-t border-primary/10 bg-surface">
              <div className="flex flex-col items-center justify-center">
                <span className="font-brand text-primary/30 text-2xl leading-[0.9]">Hatvoni</span>
                <p className="text-[9px] text-primary/50 text-center font-body uppercase tracking-[0.2em] mt-1.5 font-medium">
                  Authentic Flavors of<br/>Northeast India
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
}
