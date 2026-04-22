import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Icon from '@mui/material/Icon';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { tokens, fonts } from '../theme/hatvoniTheme';

/* ── Hatvoni star-burst SVG logo ─────────────────────── */
const HatvoniLogo = ({ size = 40, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.0799 24L4 19.2479L9.95537 8.75216L18.04 13.4961L18.0446 4H29.9554L29.96 13.4961L38.0446 8.75216L44 19.2479L35.92 24L44 28.7521L38.0446 39.2479L29.96 34.5039L29.9554 44H18.0446L18.04 34.5039L9.95537 39.2479L4 28.7521L12.0799 24Z"
      fill={color}
    />
  </svg>
);

/* ── Heritage image ──────────────────────────────────── */
const HERO_IMG =
  'https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=1470&auto=format&fit=crop';

export default function ForgotPassword() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    const { error: resetError } = await resetPassword(email);

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden' }}>
      {/* ── Header ──────────────────────────────────────── */}
      <Box
        component="nav"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2.5, md: 6, lg: 12 },
          py: { xs: 2, md: 4 },
          ...(isDesktop ? {} : {
            position: 'sticky',
            top: 0,
            zIndex: 10,
            bgcolor: alpha(tokens.background, 0.8),
            backdropFilter: 'blur(12px)',
          }),
        }}
      >
        <Link to="/login" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, color: tokens.primary }}>
          <Icon sx={{ fontSize: { xs: 20, md: 24 } }}>arrow_back</Icon>
          <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', md: '0.75rem' }, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Back to Login
          </Typography>
        </Link>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HatvoniLogo size={isDesktop ? 40 : 28} color={tokens.primaryContainer} />
          <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '1.125rem', md: '1.25rem' }, color: tokens.primary }}>
            Hatvoni
          </Typography>
        </Box>
        {/* Spacer for symmetry */}
        <Box sx={{ width: { xs: 40, md: 96 }, display: { xs: 'none', md: 'block' } }} />
      </Box>

      {/* ── Main ────────────────────────────────────────── */}
      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: { xs: 2.5, md: 3 },
          py: { xs: 2, md: 6 },
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: { xs: 4, lg: 8 },
            width: '100%',
            maxWidth: 1200,
            alignItems: 'center',
          }}
        >
          {/* ═══════ Image Panel (Desktop) ═══════ */}
          {isDesktop && (
            <Box sx={{ position: 'relative' }}>
              <Box
                sx={{
                  aspectRatio: '4 / 5',
                  overflow: 'hidden',
                  borderRadius: 3,
                  bgcolor: tokens.surfaceContainerLow,
                }}
              >
                <Box
                  component="img"
                  src={HERO_IMG}
                  alt="Heritage spices and textiles"
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </Box>
              {/* Overlapping decorative card */}
              <Box
                sx={{
                  position: 'absolute',
                  bottom: -32,
                  right: -32,
                  width: 192,
                  height: 192,
                  bgcolor: tokens.secondaryContainer,
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 4,
                }}
              >
                <Typography sx={{ fontFamily: fonts.label, fontSize: '0.875rem', fontWeight: 700, lineHeight: 1.4, color: tokens.onSecondaryContainer }}>
                  ROOTED IN TRADITION, DELIVERED TO YOUR DOOR.
                </Typography>
              </Box>
            </Box>
          )}

          {/* ═══════ Form Panel ═══════ */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5, ...(isDesktop && { pl: 6 }) }}>
            {/* Title */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', md: '0.6875rem' }, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: tokens.secondary }}>
                Recovery Protocol
              </Typography>
              <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '2.5rem', md: '3rem', lg: '3.75rem' }, lineHeight: 1, color: tokens.primary }}>
                Lost your{isDesktop ? <br /> : ' '}way?
              </Typography>
              <Typography sx={{ fontFamily: fonts.body, fontSize: { xs: '0.9375rem', md: '1.125rem' }, lineHeight: 1.6, color: tokens.onSurfaceVariant, maxWidth: 440 }}>
                No worries, it happens to the best of us. Enter your email below and we'll send a reassuring link to reset your password instantly.
              </Typography>
            </Box>

            {/* Errors / Success */}
            {error && (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ borderRadius: 3 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Check your email</Typography>
                <Typography variant="body2">
                  We sent a password reset link to <strong>{email}</strong>
                </Typography>
              </Alert>
            )}

            {/* Form */}
            {!success ? (
              <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Email */}
                <Box sx={{ position: 'relative' }}>
                  <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', md: '0.6875rem' }, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: tokens.outline, mb: 0.5 }}>
                    Email Address
                  </Typography>
                  <TextField
                    id="forgot-email"
                    type="email"
                    required
                    fullWidth
                    variant="standard"
                    placeholder="e.g. alex@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    InputProps={{
                      disableUnderline: true,
                      endAdornment: (
                        <Icon sx={{ color: tokens.outline, '.Mui-focused &': { color: tokens.primary } }}>mail</Icon>
                      ),
                      sx: {
                        fontFamily: fonts.body,
                        fontSize: { xs: '1.125rem', md: '1.25rem' },
                        py: 2,
                        px: 0,
                        borderBottom: `2px solid ${tokens.outlineVariant}`,
                        transition: 'border-color 0.2s',
                        '&.Mui-focused': { borderColor: tokens.primary },
                        '& input::placeholder': { color: tokens.surfaceDim, opacity: 1 },
                      },
                    }}
                  />
                </Box>

                {/* Actions */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    disabled={loading}
                    endIcon={!loading && <Icon>arrow_forward</Icon>}
                    sx={{
                      height: { xs: 56, lg: 64 },
                      bgcolor: tokens.primaryContainer,
                      color: '#fff',
                      fontFamily: fonts.label,
                      fontSize: { xs: '1rem', lg: '1.125rem' },
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      borderRadius: 3,
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: tokens.primary },
                      '&:active': { transform: 'scale(0.98)' },
                    }}
                  >
                    {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Reset Password'}
                  </Button>

                  {/* OR divider */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: alpha(tokens.outlineVariant, 0.3) }} />
                    <Typography sx={{ fontFamily: fonts.label, fontSize: '0.6875rem', fontWeight: 500, color: tokens.outline }}>
                      OR
                    </Typography>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: alpha(tokens.outlineVariant, 0.3) }} />
                  </Box>

                  <Button
                    component={Link}
                    to="/login"
                    fullWidth
                    variant="outlined"
                    sx={{
                      height: { xs: 56, lg: 64 },
                      borderColor: alpha(tokens.outlineVariant, 0.5),
                      bgcolor: tokens.surfaceContainerLowest,
                      color: tokens.onSurface,
                      fontFamily: fonts.label,
                      fontSize: { xs: '0.875rem', lg: '1rem' },
                      fontWeight: 700,
                      borderRadius: 3,
                      '&:hover': { bgcolor: tokens.surfaceContainerLow },
                    }}
                  >
                    Return to Secure Login
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button
                  component={Link}
                  to="/login"
                  fullWidth
                  variant="contained"
                  sx={{
                    height: { xs: 56, lg: 64 },
                    bgcolor: tokens.primaryContainer,
                    color: '#fff',
                    fontFamily: fonts.label,
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: 3,
                    '&:hover': { bgcolor: tokens.primary },
                  }}
                >
                  Back to login
                </Button>
                <Button
                  fullWidth
                  variant="text"
                  onClick={() => { setSuccess(false); setEmail(''); }}
                  sx={{ py: 1.5, color: 'text.secondary' }}
                >
                  Try another email
                </Button>
              </Box>
            )}

            {/* Trust footer */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, pt: 4, borderTop: `1px solid ${alpha(tokens.outlineVariant, 0.2)}` }}>
              <Box sx={{ display: 'flex' }}>
                {[tokens.secondaryContainer, tokens.primaryContainer, tokens.tertiaryContainer].map((c, i) => (
                  <Box key={i} sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: c, border: `2px solid ${tokens.background}`, ml: i > 0 ? -1 : 0 }} />
                ))}
              </Box>
              <Typography sx={{ fontFamily: fonts.body, fontSize: '0.75rem', color: tokens.onSurfaceVariant }}>
                Joined by over <strong style={{ color: tokens.onSurface }}>5,000+</strong> organic enthusiasts in North East India.
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Footer Decoration ────────────────────────────── */}
      <Box component="footer" sx={{ mt: 'auto', py: 5, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 3 }}>
          <Box sx={{ height: 4, width: 48, bgcolor: tokens.primary }} />
          <Box sx={{ height: 4, width: 16, bgcolor: tokens.secondary }} />
          <Box sx={{ height: 4, width: 8, bgcolor: tokens.tertiary }} />
        </Box>
        <Typography sx={{ fontFamily: fonts.label, fontSize: '0.5rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: tokens.outline }}>
          © 2024 Hatvoni Editorial. All Rights Reserved.
        </Typography>
      </Box>
    </Box>
  );
}
