import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { cartService } from '../services/cartService';
import AdminNotificationsMenu from './admin/AdminNotificationsMenu';
import SellerNotificationsMenu from './seller/SellerNotificationsMenu';
import CustomerNotificationsMenu from './customer/CustomerNotificationsMenu';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Drawer from '@mui/material/Drawer';
import Badge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

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
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const isSmUp = useMediaQuery(theme.breakpoints.up('sm'));

  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartCount, setCartCount] = useState(() => cartService.getCartCount());
  const { user, profile, isAdmin, isEmployee, isSeller, signOut } = useAuth();
  const navigate = useNavigate();

  const lastScrollY = useRef(0);
  const ticking = useRef(false);

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

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  const handleSignOut = async () => {
    closeMenu();
    await signOut();
    navigate('/');
  };

  const getUserDisplayName = () => {
    if (profile?.first_name) return profile.first_name;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const handleLinkClick = () => closeMenu();

  /* ── Render ─────────────────────────────────────────── */
  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          transform: hidden ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'all 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
          bgcolor: 'transparent',
          boxShadow: 'none',
          zIndex: theme.zIndex.appBar,
        }}
      >
        {/* ─── Announcement Bar ─── */}
        {isSmUp && (
          <Box
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              py: 0.75,
              px: 2,
              textAlign: 'center',
              borderBottom: `1px solid ${alpha(theme.palette.hatvoni.primaryFixed, 0.2)}`,
              position: 'relative',
              zIndex: 10,
            }}
          >
            <Typography
              variant="overline"
              sx={{
                fontSize: '0.6875rem',
                letterSpacing: '0.12em',
                fontWeight: 500,
                lineHeight: 1.6,
              }}
            >
              Discover the Authentic Heritage & Flavors of Northeast India
            </Typography>
          </Box>
        )}

        {/* ─── Main Toolbar ─── */}
        <Toolbar
          disableGutters
          sx={{
            bgcolor: scrolled
              ? alpha(theme.palette.hatvoni.surface, 0.9)
              : theme.palette.hatvoni.surface,
            backdropFilter: scrolled ? 'blur(12px)' : 'none',
            WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
            borderBottom: scrolled
              ? `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.3)}`
              : 'none',
            boxShadow: scrolled ? theme.shadows[1] : 'none',
            py: scrolled ? 1 : { xs: 1.5, md: 2.5 },
            px: { xs: 2, md: 4, xl: 6 },
            transition: 'all 0.5s ease',
            maxWidth: '1536px',
            width: '100%',
            mx: 'auto',
            position: 'relative',
          }}
        >
          {/* ─── Logo ─── */}
          <Link to="/" style={{ textDecoration: 'none', zIndex: 10 }}>
            <Typography
              variant="h4"
              sx={{
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                fontWeight: 700,
                color: 'primary.main',
                fontSize: { xs: '1.5rem', md: '2.25rem' },
                letterSpacing: '-0.02em',
                lineHeight: 0.9,
                transition: 'opacity 0.3s ease',
                '&:hover': { opacity: 0.8 },
              }}
            >
              Hatvoni
            </Typography>
          </Link>

          {/* ─── Desktop Nav Links ─── */}
          {isDesktop && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { lg: 0.5, xl: 1 },
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  style={{ textDecoration: 'none' }}
                >
                  {({ isActive }) => (
                    <Box
                      sx={{
                        position: 'relative',
                        px: 1.5,
                        py: 1,
                        borderRadius: '9999px',
                        fontSize: { lg: '0.875rem', xl: '0.9375rem' },
                        fontWeight: 500,
                        fontFamily: '"Inter", sans-serif',
                        letterSpacing: '0.02em',
                        color: isActive
                          ? 'primary.main'
                          : alpha(theme.palette.primary.main, 0.65),
                        transition: 'all 0.3s ease',
                        cursor: 'pointer',
                        '&:hover': {
                          color: 'primary.main',
                          bgcolor: alpha(theme.palette.primary.main, 0.05),
                        },
                      }}
                    >
                      {link.label}
                      {isActive && (
                        <Box
                          sx={{
                            position: 'absolute',
                            bottom: -2,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            height: 3,
                            width: 5,
                            bgcolor: 'secondary.main',
                            borderRadius: '9999px',
                          }}
                        />
                      )}
                    </Box>
                  )}
                </NavLink>
              ))}
            </Box>
          )}

          {/* ─── Right-side Actions ─── */}
          <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', gap: { xs: 0.25, md: 0.5 }, zIndex: 10 }}>
            {/* Desktop Wishlist & Cart */}
            {isSmUp && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <IconButton
                  component={Link}
                  to="/wishlist"
                  aria-label="Wishlist"
                  sx={{
                    color: alpha(theme.palette.primary.main, 0.7),
                    '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.05) },
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 24 }}>favorite</span>
                </IconButton>
                <IconButton
                  component={Link}
                  to="/cart"
                  aria-label="Cart"
                  sx={{
                    color: alpha(theme.palette.primary.main, 0.7),
                    '&:hover': { color: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.05) },
                  }}
                >
                  <Badge
                    badgeContent={cartCount}
                    color="primary"
                    sx={{
                      '& .MuiBadge-badge': {
                        bgcolor: theme.palette.hatvoni.secondaryContainer,
                        color: theme.palette.hatvoni.onSecondaryContainer,
                        fontSize: '0.625rem',
                        fontWeight: 800,
                        minWidth: 18,
                        height: 18,
                        border: `2px solid ${theme.palette.hatvoni.surface}`,
                      },
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>shopping_cart</span>
                  </Badge>
                </IconButton>
              </Box>
            )}

            {/* User Section */}
            {user ? (
              <>
                {/* Desktop auth section */}
                <Box
                  sx={{
                    display: { xs: 'none', md: 'flex' },
                    alignItems: 'center',
                    gap: 1.5,
                    ml: 2,
                    pl: 3,
                    borderLeft: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.4)}`,
                  }}
                >
                  {(isAdmin || isEmployee) && (
                    <>
                      <AdminNotificationsMenu userId={user?.id} />
                      <Button
                        component={Link}
                        to="/admin"
                        size="small"
                        sx={{
                          bgcolor: '#f59e0b',
                          color: '#fff',
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          px: 2,
                          py: 0.75,
                          borderRadius: '9999px',
                          '&:hover': { bgcolor: '#d97706' },
                        }}
                      >
                        {isAdmin ? 'Admin' : 'Staff'}
                      </Button>
                    </>
                  )}
                  {!isAdmin && !isEmployee && isSeller && <SellerNotificationsMenu userId={user?.id} />}
                  {!isAdmin && !isEmployee && !isSeller && <CustomerNotificationsMenu userId={user?.id} />}
                  {isSeller && (
                    <Button
                      component={Link}
                      to="/seller"
                      variant="outlined"
                      size="small"
                      sx={{
                        display: { xs: 'none', xl: 'inline-flex' },
                        fontSize: '0.6875rem',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        px: 2,
                        py: 0.75,
                      }}
                    >
                      Seller
                    </Button>
                  )}
                  <IconButton
                    component={Link}
                    to="/profile"
                    sx={{
                      p: 0.5,
                      pr: 2,
                      borderRadius: '9999px',
                      border: '1px solid transparent',
                      '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.05),
                        border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.3)}`,
                      },
                    }}
                  >
                    <Avatar
                      src={profile?.avatar_url}
                      alt={getUserDisplayName()}
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: theme.palette.hatvoni.surfaceVariant,
                        color: alpha(theme.palette.primary.main, 0.7),
                        fontSize: '0.875rem',
                        mr: 1,
                      }}
                    >
                      {!profile?.avatar_url && (
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person</span>
                      )}
                    </Avatar>
                    <Typography
                      variant="body2"
                      sx={{
                        display: { xs: 'none', lg: 'block' },
                        fontWeight: 500,
                        color: 'primary.main',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {getUserDisplayName()}
                    </Typography>
                  </IconButton>
                </Box>

                {/* Mobile cart icon (only visible on xs) */}
                {!isSmUp && (
                  <IconButton
                    component={Link}
                    to="/cart"
                    aria-label="Cart"
                    size="small"
                    sx={{
                      color: alpha(theme.palette.primary.main, 0.7),
                      ml: 0.5,
                    }}
                  >
                    <Badge
                      badgeContent={cartCount}
                      sx={{
                        '& .MuiBadge-badge': {
                          bgcolor: theme.palette.hatvoni.secondaryContainer,
                          color: theme.palette.hatvoni.onSecondaryContainer,
                          fontSize: '0.5625rem',
                          fontWeight: 800,
                          minWidth: 16,
                          height: 16,
                        },
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>shopping_cart</span>
                    </Badge>
                  </IconButton>
                )}
              </>
            ) : (
              /* Logged-out buttons */
              <Box
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  alignItems: 'center',
                  gap: 1,
                  ml: 2,
                  pl: 3,
                  borderLeft: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.4)}`,
                }}
              >
                <Button
                  component={Link}
                  to="/login"
                  variant="text"
                  sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'primary.main' }}
                >
                  Log In
                </Button>
                <Button
                  component={Link}
                  to="/signup"
                  variant="contained"
                  sx={{
                    px: 3,
                    py: 1.25,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    boxShadow: theme.shadows[1],
                    '&:hover': { boxShadow: theme.shadows[3] },
                  }}
                >
                  Join Us
                </Button>
              </Box>
            )}

            {/* ─── Mobile Menu Toggle ─── */}
            {!isDesktop && (
              <IconButton
                onClick={toggleMenu}
                aria-label="Toggle menu"
                aria-expanded={menuOpen}
                sx={{
                  ml: 1,
                  color: 'primary.main',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                }}
              >
                <Box
                  sx={{
                    width: 22,
                    height: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    position: 'relative',
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      height: 2,
                      bgcolor: 'primary.main',
                      borderRadius: 9999,
                      transition: 'all 0.3s ease',
                      position: 'absolute',
                      width: '100%',
                      ...(menuOpen
                        ? { transform: 'rotate(45deg)', top: '50%', mt: '-1px' }
                        : { top: 0 }),
                    }}
                  />
                  <Box
                    component="span"
                    sx={{
                      height: 2,
                      bgcolor: 'primary.main',
                      borderRadius: 9999,
                      transition: 'all 0.2s ease',
                      position: 'absolute',
                      width: '80%',
                      top: '50%',
                      mt: '-1px',
                      ...(menuOpen ? { opacity: 0, transform: 'translateX(8px)' } : {}),
                    }}
                  />
                  <Box
                    component="span"
                    sx={{
                      height: 2,
                      bgcolor: 'primary.main',
                      borderRadius: 9999,
                      transition: 'all 0.3s ease',
                      position: 'absolute',
                      width: '100%',
                      ...(menuOpen
                        ? { transform: 'rotate(-45deg)', top: '50%', mt: '-1px' }
                        : { bottom: 0 }),
                    }}
                  />
                </Box>
              </IconButton>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      {/* ─── Mobile Drawer ─── */}
      <Drawer
        anchor="right"
        open={menuOpen}
        onClose={closeMenu}
        sx={{
          display: { lg: 'none' },
          '& .MuiDrawer-paper': {
            width: { xs: '85%', sm: 360 },
            maxWidth: 360,
            bgcolor: theme.palette.hatvoni.surface,
            borderRadius: 0,
            border: 'none',
          },
          '& .MuiBackdrop-root': {
            bgcolor: alpha(theme.palette.common.black, 0.4),
            backdropFilter: 'blur(4px)',
          },
        }}
      >
        {/* Drawer Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2.5,
            borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
          }}
        >
          <Link to="/" onClick={handleLinkClick} style={{ textDecoration: 'none' }}>
            <Typography
              sx={{
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                fontSize: '1.875rem',
                color: 'primary.main',
                letterSpacing: '-0.03em',
                lineHeight: 1,
                fontWeight: 700,
              }}
            >
              Hatvoni
            </Typography>
          </Link>
          <IconButton
            onClick={closeMenu}
            aria-label="Close menu"
            sx={{
              color: alpha(theme.palette.primary.main, 0.6),
              mr: -0.5,
              '&:hover': {
                color: 'primary.main',
                bgcolor: theme.palette.hatvoni.surfaceContainer,
              },
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </IconButton>
        </Box>

        {/* Drawer Body */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 2.5,
            py: 3,
            bgcolor: theme.palette.hatvoni.surfaceContainerLowest,
            '&::-webkit-scrollbar': { display: 'none' },
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
          }}
        >
          {/* Nav Links */}
          <List disablePadding>
            {navLinks.map((link) => (
              <ListItemButton
                key={link.to}
                component={NavLink}
                to={link.to}
                end={link.to === '/'}
                onClick={handleLinkClick}
                sx={{
                  borderRadius: 4,
                  mb: 0.25,
                  py: 1.5,
                  px: 2,
                  fontFamily: '"Plus Jakarta Sans", sans-serif',
                  fontWeight: 500,
                  fontSize: '1rem',
                  letterSpacing: '0.01em',
                  color: alpha(theme.palette.primary.main, 0.65),
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: alpha(theme.palette.primary.main, 0.05),
                    fontWeight: 600,
                  },
                  '&:hover': {
                    bgcolor: theme.palette.hatvoni.surfaceContainer,
                    color: 'primary.main',
                  },
                }}
              >
                <ListItemText
                  primary={link.label}
                  primaryTypographyProps={{
                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                    fontWeight: 'inherit',
                    fontSize: 'inherit',
                    letterSpacing: 'inherit',
                  }}
                />
              </ListItemButton>
            ))}
          </List>

          {/* Shopping Section */}
          <Divider sx={{ my: 3, borderColor: alpha(theme.palette.primary.main, 0.1) }} />
          <Typography variant="overline" sx={{ color: alpha(theme.palette.primary.main, 0.35), px: 2, mb: 1, display: 'block' }}>
            Shopping
          </Typography>
          <List disablePadding>
            <ListItemButton component={Link} to="/wishlist" onClick={handleLinkClick} sx={{ borderRadius: 4, py: 1.5, px: 2 }}>
              <ListItemIcon sx={{ minWidth: 36, color: alpha(theme.palette.primary.main, 0.5) }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>favorite</span>
              </ListItemIcon>
              <ListItemText primary="Wishlist" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
            </ListItemButton>
            <ListItemButton component={Link} to="/cart" onClick={handleLinkClick} sx={{ borderRadius: 4, py: 1.5, px: 2 }}>
              <ListItemIcon sx={{ minWidth: 36, color: alpha(theme.palette.primary.main, 0.5) }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>shopping_cart</span>
              </ListItemIcon>
              <ListItemText primary="Shopping Cart" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
              {cartCount > 0 && (
                <Chip
                  label={cartCount}
                  size="small"
                  sx={{
                    bgcolor: theme.palette.hatvoni.secondaryContainer,
                    color: theme.palette.hatvoni.onSecondaryContainer,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    height: 24,
                    minWidth: 32,
                  }}
                />
              )}
            </ListItemButton>
          </List>

          {/* Account Section */}
          <Divider sx={{ my: 3, borderColor: alpha(theme.palette.primary.main, 0.1) }} />
          <Typography variant="overline" sx={{ color: alpha(theme.palette.primary.main, 0.35), px: 2, mb: 1, display: 'block' }}>
            Account
          </Typography>
          <List disablePadding>
            {user ? (
              <>
                {(isAdmin || isEmployee) && (
                  <>
                    <ListItemButton
                      component={Link}
                      to="/admin"
                      onClick={handleLinkClick}
                      sx={{
                        borderRadius: 4,
                        py: 1.5,
                        px: 2,
                        bgcolor: alpha('#f59e0b', 0.1),
                        color: '#b45309',
                        '&:hover': { bgcolor: alpha('#f59e0b', 0.2) },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>admin_panel_settings</span>
                      </ListItemIcon>
                      <ListItemText
                        primary={isAdmin ? 'Admin Dashboard' : 'Staff Dashboard'}
                        primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                      />
                    </ListItemButton>
                    <Box sx={{ px: 1, py: 0.5 }}>
                      <AdminNotificationsMenu userId={user?.id} />
                    </Box>
                  </>
                )}
                {!isAdmin && !isEmployee && isSeller && (
                  <>
                    <ListItemButton
                      component={Link}
                      to="/seller"
                      onClick={handleLinkClick}
                      sx={{
                        borderRadius: 4,
                        py: 1.5,
                        px: 2,
                        mt: 0.5,
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: 'primary.main',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>storefront</span>
                      </ListItemIcon>
                      <ListItemText
                        primary="Seller Panel"
                        primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                      />
                    </ListItemButton>
                    <Box sx={{ px: 1, py: 0.5 }}>
                      <SellerNotificationsMenu userId={user?.id} />
                    </Box>
                  </>
                )}
                {!isAdmin && !isEmployee && !isSeller && (
                  <Box sx={{ px: 1, py: 0.5 }}>
                    <CustomerNotificationsMenu userId={user?.id} />
                  </Box>
                )}
                <ListItemButton component={Link} to="/profile" onClick={handleLinkClick} sx={{ borderRadius: 4, py: 1.5, px: 2, mt: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36, color: alpha(theme.palette.primary.main, 0.5) }}>
                    {profile?.avatar_url ? (
                      <Avatar src={profile.avatar_url} alt="" sx={{ width: 20, height: 20 }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person</span>
                    )}
                  </ListItemIcon>
                  <ListItemText primary="My Profile" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
                </ListItemButton>
                <ListItemButton component={Link} to="/orders" onClick={handleLinkClick} sx={{ borderRadius: 4, py: 1.5, px: 2 }}>
                  <ListItemIcon sx={{ minWidth: 36, color: alpha(theme.palette.primary.main, 0.5) }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>package_2</span>
                  </ListItemIcon>
                  <ListItemText primary="My Orders" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
                </ListItemButton>
                <ListItemButton
                  onClick={handleSignOut}
                  sx={{
                    borderRadius: 4,
                    py: 1.5,
                    px: 2,
                    mt: 2,
                    color: 'error.main',
                    bgcolor: alpha(theme.palette.error.main, 0.04),
                    '&:hover': { bgcolor: alpha(theme.palette.error.main, 0.1) },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
                  </ListItemIcon>
                  <ListItemText primary="Sign out" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} />
                </ListItemButton>
              </>
            ) : (
              <>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5, px: 0.5 }}>
                  <Button
                    component={Link}
                    to="/login"
                    onClick={handleLinkClick}
                    fullWidth
                    variant="outlined"
                    sx={{
                      py: 1.5,
                      borderRadius: 4,
                      fontWeight: 600,
                      bgcolor: theme.palette.hatvoni.surfaceContainer,
                      borderColor: 'transparent',
                      color: 'primary.main',
                      '&:hover': {
                        bgcolor: theme.palette.hatvoni.surfaceVariant,
                        borderColor: 'transparent',
                      },
                    }}
                  >
                    Log In
                  </Button>
                  <Button
                    component={Link}
                    to="/signup"
                    onClick={handleLinkClick}
                    fullWidth
                    variant="contained"
                    sx={{
                      py: 1.5,
                      borderRadius: 4,
                      fontWeight: 600,
                      boxShadow: theme.shadows[3],
                    }}
                  >
                    Create an Account
                  </Button>
                </Box>
              </>
            )}
          </List>
        </Box>

        {/* Drawer Footer */}
        <Box
          sx={{
            px: 3,
            py: 2.5,
            borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
            textAlign: 'center',
            bgcolor: theme.palette.hatvoni.surface,
          }}
        >
          <Typography
            sx={{
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: alpha(theme.palette.primary.main, 0.25),
              fontSize: '1.5rem',
              lineHeight: 0.9,
            }}
          >
            Hatvoni
          </Typography>
          <Typography
            variant="overline"
            sx={{
              color: alpha(theme.palette.primary.main, 0.45),
              fontSize: '0.5625rem',
              letterSpacing: '0.2em',
              mt: 0.75,
              display: 'block',
              lineHeight: 1.4,
            }}
          >
            Authentic Flavors of<br />Northeast India
          </Typography>
        </Box>
      </Drawer>
    </>
  );
}
