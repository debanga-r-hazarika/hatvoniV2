import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Icon from '@mui/material/Icon';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { tokens, fonts } from '../theme/hatvoniTheme';

export default function ConfirmAccount() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  const needsConfirmation = location.state?.needsConfirmation;
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (!email) {
      navigate('/signup');
    }
  }, [email, navigate]);

  const handleResendEmail = async () => {
    setResendLoading(true);
    setResendError('');
    setResendSuccess(false);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      setResendError(error.message);
    } else {
      setResendSuccess(true);
    }
    setResendLoading(false);
  };

  /* ── Info card rows ──────────────────────────────────── */
  const InfoCards = () => (
    <Box
      sx={{
        width: '100%',
        maxWidth: 800,
        mt: { xs: 3, md: 6 },
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' },
        gap: { xs: 1.5, md: 3 },
      }}
    >
      {[
        { icon: 'security', title: 'Secure Link', desc: 'Your confirmation link is uniquely generated and encrypted for your safety.' },
        { icon: 'support_agent', title: 'Need Help?', desc: 'Our support team is available to assist you with any login issues.' },
        { icon: 'history_edu', title: 'Our Legacy', desc: 'While you wait, explore our story of North Eastern botanical heritage.' },
      ].map(({ icon, title, desc }) => (
        <Box
          key={title}
          sx={{
            bgcolor: alpha(tokens.surfaceContainerLow, 0.8),
            p: { xs: 2.5, md: 3 },
            borderRadius: 3,
            display: 'flex',
            flexDirection: { xs: 'row', md: 'column' },
            alignItems: { xs: 'flex-start', md: 'stretch' },
            gap: { xs: 2, md: 1.5 },
            border: `1px solid ${alpha(tokens.outlineVariant, 0.1)}`,
          }}
        >
          <Icon sx={{ color: tokens.secondary, fontSize: 24, fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>{icon}</Icon>
          <Box>
            <Typography sx={{ fontFamily: fonts.headline, fontWeight: 700, fontSize: '0.875rem', color: tokens.primary }}>{title}</Typography>
            <Typography sx={{ fontFamily: fonts.body, fontSize: '0.75rem', color: tokens.onSurfaceVariant, mt: 0.5 }}>{desc}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );

  /* ── Needs confirmation (email verification pending) ─── */
  if (needsConfirmation) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Top accent bar */}
        <Box sx={{ width: '100%', height: { xs: 6, md: 8 }, bgcolor: tokens.primary }} />

        <Box
          component="main"
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: { xs: 2.5, md: 6 },
            py: { xs: 4, md: 6 },
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Background decorative icons */}
          <Icon sx={{ position: 'absolute', top: { xs: -40, md: 16 }, left: { xs: -40, md: 16 }, fontSize: { xs: 140, md: 120 }, color: tokens.primary, opacity: 0.1, fontVariationSettings: "'FILL' 1" }}>eco</Icon>
          <Icon sx={{ position: 'absolute', bottom: { xs: -40, md: 48 }, right: { xs: -40, md: 48 }, fontSize: { xs: 160, md: 180 }, color: tokens.secondary, opacity: 0.1, fontVariationSettings: "'FILL' 1", transform: 'rotate(12deg)' }}>local_florist</Icon>

          {/* ═══════ Main Card ═══════ */}
          <Box
            sx={{
              maxWidth: 800,
              width: '100%',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              bgcolor: tokens.surfaceContainerLow,
              borderRadius: { xs: 4, md: 3 },
              overflow: 'hidden',
              boxShadow: `0 10px 40px -10px ${alpha(tokens.onSurface, 0.15)}`,
              position: 'relative',
              zIndex: 10,
            }}
          >
            {/* ─── Visual side ─── */}
            <Box
              sx={{
                bgcolor: tokens.primaryContainer,
                p: { xs: 4, md: 6 },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Dot pattern overlay */}
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0.05,
                  pointerEvents: 'none',
                  backgroundImage: `radial-gradient(${tokens.secondaryContainer} 1px, transparent 1px)`,
                  backgroundSize: { xs: '15px 15px', md: '20px 20px' },
                }}
              />

              {/* Icon circle */}
              <Box
                sx={{
                  position: 'relative',
                  zIndex: 20,
                  width: { xs: 192, md: 280 },
                  height: { xs: 192, md: 280 },
                  bgcolor: tokens.surfaceContainerLowest,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `${isDesktop ? 8 : 4}px solid ${alpha(tokens.primary, 0.2)}`,
                }}
              >
                <Box sx={{ position: 'relative' }}>
                  <Icon sx={{ fontSize: { xs: 80, md: 120 }, color: tokens.secondary, fontVariationSettings: "'FILL' 1" }}>mark_email_read</Icon>
                  <Box
                    sx={{
                      position: 'absolute',
                      top: { xs: -8, md: -16 },
                      right: { xs: -8, md: -16 },
                      bgcolor: tokens.tertiary,
                      color: tokens.onTertiary,
                      p: { xs: 1, md: 1.5 },
                      borderRadius: '50%',
                      animation: 'bounce 2s infinite',
                      '@keyframes bounce': {
                        '0%, 100%': { transform: 'translateY(0)' },
                        '50%': { transform: 'translateY(-6px)' },
                      },
                    }}
                  >
                    <Icon sx={{ fontSize: { xs: 16, md: 24 } }}>auto_awesome</Icon>
                  </Box>
                </Box>
              </Box>

              <Typography sx={{ mt: { xs: 3, md: 4 }, fontFamily: fonts.label, fontSize: { xs: '0.5rem', md: '0.75rem' }, letterSpacing: '0.2em', textTransform: 'uppercase', color: alpha(tokens.onPrimaryContainer, 0.7) }}>
                The Modern Ethnobotanist
              </Typography>
            </Box>

            {/* ─── Content side ─── */}
            <Box sx={{ p: { xs: 3, md: 8 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: tokens.surface }}>
              <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '1.875rem', md: '2.5rem', lg: '3rem' }, color: tokens.primary, lineHeight: 1.1, mb: { xs: 2, md: 3 }, textAlign: { xs: 'center', md: 'left' } }}>
                Check Your Inbox
              </Typography>
              <Typography sx={{ fontFamily: fonts.body, color: tokens.onSurfaceVariant, fontSize: { xs: '0.875rem', md: '1.125rem' }, lineHeight: 1.6, mb: { xs: 4, md: 5 }, textAlign: { xs: 'center', md: 'left' }, px: { xs: 1, md: 0 } }}>
                We've sent a digital courier your way. Please follow the link in the email to confirm your identity and continue your journey into our curated collections.
              </Typography>

              {/* Status Details */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: { xs: 4, md: 6 }, ...(isDesktop ? {} : { bgcolor: alpha(tokens.surfaceContainer, 0.3), p: 2, borderRadius: 3 }) }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: alpha(tokens.secondaryContainer, isDesktop ? 0.3 : 0.2), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon sx={{ color: tokens.secondary, fontSize: 20 }}>drafts</Icon>
                  </Box>
                  <Box>
                    <Typography sx={{ fontFamily: fonts.body, fontWeight: 700, fontSize: { xs: '0.75rem', md: '0.875rem' }, color: tokens.onSurface, ...(isDesktop ? {} : { textTransform: 'uppercase', letterSpacing: '0.1em' }) }}>
                      {isDesktop ? 'Sender Information' : 'Sender'}
                    </Typography>
                    <Typography sx={{ fontFamily: fonts.body, fontSize: '0.875rem', color: tokens.onSurfaceVariant }}>
                      hello@hatvoni.com
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ...(isDesktop ? {} : { borderTop: `1px solid ${alpha(tokens.outlineVariant, 0.1)}`, pt: 2 }) }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: alpha(tokens.secondaryContainer, isDesktop ? 0.3 : 0.2), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon sx={{ color: tokens.secondary, fontSize: 20 }}>schedule</Icon>
                  </Box>
                  <Box>
                    <Typography sx={{ fontFamily: fonts.body, fontWeight: 700, fontSize: { xs: '0.75rem', md: '0.875rem' }, color: tokens.onSurface, ...(isDesktop ? {} : { textTransform: 'uppercase', letterSpacing: '0.1em' }) }}>
                      {isDesktop ? 'Time Remaining' : 'Expiry'}
                    </Typography>
                    <Typography sx={{ fontFamily: fonts.body, fontSize: '0.875rem', color: tokens.onSurfaceVariant }}>
                      Link expires in 24 hours
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Resend feedback */}
              {resendSuccess && (
                <Alert severity="success" sx={{ mb: 2, borderRadius: 3 }}>
                  Confirmation email resent successfully!
                </Alert>
              )}
              {resendError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
                  {resendError}
                </Alert>
              )}

              {/* Actions */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Button
                  component={Link}
                  to="/"
                  fullWidth
                  variant="contained"
                  endIcon={<Icon>arrow_forward</Icon>}
                  sx={{
                    py: 1.75,
                    bgcolor: tokens.primaryContainer,
                    color: tokens.onPrimaryContainer,
                    fontFamily: fonts.headline,
                    fontWeight: 700,
                    borderRadius: 3,
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: tokens.primary, boxShadow: `0 8px 24px ${alpha(tokens.primary, 0.3)}` },
                    '&:active': { transform: 'scale(0.95)' },
                  }}
                >
                  Return to Home
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleResendEmail}
                  disabled={resendLoading || resendSuccess}
                  startIcon={resendLoading ? <CircularProgress size={18} /> : <Icon sx={{ fontSize: 18 }}>refresh</Icon>}
                  sx={{
                    py: 1.5,
                    borderColor: alpha(tokens.outlineVariant, 0.4),
                    color: tokens.primary,
                    fontFamily: fonts.headline,
                    fontWeight: 600,
                    borderRadius: 3,
                    '&:hover': { bgcolor: tokens.surfaceContainerLow },
                    '&:active': { transform: 'scale(0.95)' },
                  }}
                >
                  {resendLoading ? 'Sending...' : resendSuccess ? 'Email Sent!' : 'Resend Email'}
                </Button>
              </Box>

              <Typography sx={{ mt: 4, fontFamily: fonts.label, fontSize: '0.625rem', color: alpha(tokens.onSurfaceVariant, 0.6), textAlign: 'center', fontStyle: 'italic', letterSpacing: '0.05em' }}>
                If you don't see it, please check your spam or promotional folders.
              </Typography>
            </Box>
          </Box>

          {/* ── Info cards ────────────────────────────────── */}
          <InfoCards />
        </Box>

        {/* ── Footer ─────────────────────────────────────── */}
        <Box
          component="footer"
          sx={{
            bgcolor: tokens.primary,
            py: { xs: 5, md: 6 },
            px: { xs: 3, md: 4 },
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 3,
            width: '100%',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: { xs: 'center', md: 'flex-start' } }}>
            <Typography sx={{ fontFamily: fonts.headline, fontSize: '1.25rem', fontWeight: 700, color: tokens.surface }}>Hatvoni</Typography>
            <Typography sx={{ fontSize: '0.625rem', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: fonts.body, color: tokens.secondaryContainer }}>
              © 2024 Hatvoni. The Modern Ethnobotanist.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: { xs: 3, md: 4 } }}>
            {['Privacy Policy', 'Terms of Service', 'Contact Us', 'Shipping Info'].map((item) => (
              <Typography key={item} component="a" href="#" sx={{ color: alpha(tokens.surface, 0.8), fontSize: '0.875rem', fontFamily: fonts.body, textDecoration: 'none', transition: 'color 0.2s', '&:hover': { color: tokens.secondaryContainer } }}>
                {item}
              </Typography>
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Icon sx={{ color: alpha(tokens.surface, 0.8), cursor: 'pointer', transition: 'opacity 0.2s', '&:hover': { opacity: 1 }, opacity: 0.8 }}>language</Icon>
            <Icon sx={{ color: alpha(tokens.surface, 0.8), cursor: 'pointer', transition: 'opacity 0.2s', '&:hover': { opacity: 1 }, opacity: 0.8 }}>share</Icon>
          </Box>
        </Box>
      </Box>
    );
  }

  /* ── Default: Account confirmed ────────────────────── */
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top accent bar */}
      <Box sx={{ width: '100%', height: { xs: 6, md: 8 }, bgcolor: tokens.primary }} />

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2.5, md: 6 },
          py: { xs: 4, md: 6 },
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decorative icons */}
        <Icon sx={{ position: 'absolute', top: 16, left: 16, fontSize: 120, color: tokens.primary, opacity: 0.1, fontVariationSettings: "'FILL' 1" }}>eco</Icon>
        <Icon sx={{ position: 'absolute', bottom: 48, right: 48, fontSize: 180, color: tokens.secondary, opacity: 0.1, fontVariationSettings: "'FILL' 1", transform: 'rotate(12deg)' }}>local_florist</Icon>

        {/* ═══════ Main Card ═══════ */}
        <Box
          sx={{
            maxWidth: 800,
            width: '100%',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            bgcolor: tokens.surfaceContainerLow,
            borderRadius: { xs: 4, md: 3 },
            overflow: 'hidden',
            boxShadow: `0 10px 40px -10px ${alpha(tokens.onSurface, 0.15)}`,
            position: 'relative',
            zIndex: 10,
          }}
        >
          {/* ─── Visual side ─── */}
          <Box
            sx={{
              bgcolor: tokens.primaryContainer,
              p: { xs: 4, md: 6 },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                opacity: 0.05,
                pointerEvents: 'none',
                backgroundImage: `radial-gradient(${tokens.secondaryContainer} 1px, transparent 1px)`,
                backgroundSize: { xs: '15px 15px', md: '20px 20px' },
              }}
            />
            <Box
              sx={{
                position: 'relative',
                zIndex: 20,
                width: { xs: 192, md: 280 },
                height: { xs: 192, md: 280 },
                bgcolor: tokens.surfaceContainerLowest,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `${isDesktop ? 8 : 4}px solid ${alpha(tokens.primary, 0.2)}`,
              }}
            >
              <Box sx={{ position: 'relative' }}>
                <Icon sx={{ fontSize: { xs: 80, md: 120 }, color: tokens.secondary, fontVariationSettings: "'FILL' 1" }}>check_circle</Icon>
                <Box
                  sx={{
                    position: 'absolute',
                    top: -16,
                    right: -16,
                    bgcolor: tokens.primaryContainer,
                    color: tokens.onPrimaryContainer,
                    p: 1.5,
                    borderRadius: '50%',
                    animation: 'bounce 2s infinite',
                    '@keyframes bounce': {
                      '0%, 100%': { transform: 'translateY(0)' },
                      '50%': { transform: 'translateY(-6px)' },
                    },
                  }}
                >
                  <Icon sx={{ fontSize: 24 }}>celebration</Icon>
                </Box>
              </Box>
            </Box>
            <Typography sx={{ mt: 4, fontFamily: fonts.label, fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: alpha(tokens.onPrimaryContainer, 0.7) }}>
              The Modern Ethnobotanist
            </Typography>
          </Box>

          {/* ─── Content side ─── */}
          <Box sx={{ p: { xs: 3, md: 8 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: tokens.surface }}>
            <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '1.875rem', md: '2.5rem' }, color: tokens.primary, lineHeight: 1.1, mb: 3, textAlign: { xs: 'center', md: 'left' } }}>
              Welcome to Hatvoni!
            </Typography>
            <Typography sx={{ fontFamily: fonts.body, color: tokens.onSurfaceVariant, fontSize: '1.125rem', lineHeight: 1.6, mb: 5, textAlign: { xs: 'center', md: 'left' } }}>
              Your account has been successfully created and verified. You're now part of our heritage community.
            </Typography>

            {email && (
              <Box sx={{ p: 3, mb: 4, bgcolor: tokens.surfaceContainerLow, border: `1px solid ${alpha(tokens.outlineVariant, 0.3)}`, borderRadius: 3, textAlign: 'left' }}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Your account is ready to use</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  You can now access your profile and start shopping for authentic heritage products.
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
                  Account email: <strong style={{ color: tokens.onSurface }}>{email}</strong>
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Button
                component={Link}
                to="/profile"
                fullWidth
                variant="contained"
                endIcon={<Icon>arrow_forward</Icon>}
                sx={{
                  py: 1.75,
                  bgcolor: tokens.primaryContainer,
                  color: tokens.onPrimaryContainer,
                  fontFamily: fonts.headline,
                  fontWeight: 700,
                  borderRadius: 3,
                  transition: 'all 0.2s',
                  '&:hover': { bgcolor: tokens.primary, boxShadow: `0 8px 24px ${alpha(tokens.primary, 0.3)}` },
                  '&:active': { transform: 'scale(0.95)' },
                }}
              >
                Go to My Profile
              </Button>
              <Button
                component={Link}
                to="/products"
                fullWidth
                variant="outlined"
                sx={{
                  py: 1.5,
                  borderColor: alpha(tokens.outlineVariant, 0.4),
                  color: tokens.primary,
                  fontFamily: fonts.headline,
                  fontWeight: 600,
                  borderRadius: 3,
                  '&:hover': { bgcolor: tokens.surfaceContainerLow },
                  '&:active': { transform: 'scale(0.95)' },
                }}
              >
                Start Shopping
              </Button>
              <Button
                component={Link}
                to="/"
                fullWidth
                variant="text"
                sx={{ color: 'text.secondary', fontWeight: 500 }}
              >
                Go to Homepage
              </Button>
            </Box>

            <Typography sx={{ mt: 4, fontFamily: fonts.label, fontSize: '0.625rem', color: alpha(tokens.onSurfaceVariant, 0.6), textAlign: 'center', letterSpacing: '0.05em' }}>
              Questions? Contact us at{' '}
              <a href="mailto:hello@hatvoni.com" style={{ fontWeight: 600, color: tokens.primary, textDecoration: 'underline' }}>
                hello@hatvoni.com
              </a>
            </Typography>
          </Box>
        </Box>

        {/* ── Info cards ────────────────────────────────── */}
        <InfoCards />
      </Box>

      {/* ── Footer ─────────────────────────────────────── */}
      <Box
        component="footer"
        sx={{
          bgcolor: tokens.primary,
          py: { xs: 5, md: 6 },
          px: { xs: 3, md: 4 },
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 3,
          width: '100%',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: { xs: 'center', md: 'flex-start' } }}>
          <Typography sx={{ fontFamily: fonts.headline, fontSize: '1.25rem', fontWeight: 700, color: tokens.surface }}>Hatvoni</Typography>
          <Typography sx={{ fontSize: '0.625rem', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: fonts.body, color: tokens.secondaryContainer }}>
            © 2024 Hatvoni. The Modern Ethnobotanist.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: { xs: 3, md: 4 } }}>
          {['Privacy Policy', 'Terms of Service', 'Contact Us', 'Shipping Info'].map((item) => (
            <Typography key={item} component="a" href="#" sx={{ color: alpha(tokens.surface, 0.8), fontSize: '0.875rem', fontFamily: fonts.body, textDecoration: 'none', transition: 'color 0.2s', '&:hover': { color: tokens.secondaryContainer } }}>
              {item}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Icon sx={{ color: alpha(tokens.surface, 0.8), cursor: 'pointer', opacity: 0.8, '&:hover': { opacity: 1 } }}>language</Icon>
          <Icon sx={{ color: alpha(tokens.surface, 0.8), cursor: 'pointer', opacity: 0.8, '&:hover': { opacity: 1 } }}>share</Icon>
        </Box>
      </Box>
    </Box>
  );
}
