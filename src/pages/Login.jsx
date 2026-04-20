import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
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

/* ── Background image URL ────────────────────────────── */
const HERO_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCdgo3BIB-1SY7EDeIk5jINmSIHU_0aV21C6SNWRjpB-6H1fRaFBPZ1NFldAPzbQLS1s4tonuA5vnLq7H3ktVsNJs7Hv0s_98m-J2JffOc_-d07ZVfn5cz7X-e6_qwNgsCE7G8VAh5O9zRv9rVIpbgOBlNIJcmSlfm2PyNOQEjXBz-21i53qnNCSDx-NOavTrsff7Q5SU2V5Mll8ISY6UCkOt83oj8BIxwfFH4754BmLvnBzRyUC5wWaLr1gSn2ckfKQUbTVmc7JQGW';

export default function Login() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      if (signInError.message.includes('Email not confirmed')) {
        setError('Please verify your email address before signing in. Check your inbox for the confirmation link.');
      } else if (signInError.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else {
        setError(signInError.message);
      }
      setLoading(false);
    } else {
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      navigate('/');
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    const { error: googleError } = await signInWithGoogle();
    if (googleError) {
      setError(googleError.message);
      setGoogleLoading(false);
    }
  };

  /* ── Accent dots ─────────────────────────────────────── */
  const AccentDots = () => (
    <Box sx={{ display: 'flex', gap: 1, mt: 'auto', pt: { xs: 5, lg: 6 } }}>
      <Box sx={{ width: { xs: 6, lg: 8 }, height: { xs: 6, lg: 8 }, borderRadius: '50%', bgcolor: tokens.tertiary }} />
      <Box sx={{ width: { xs: 6, lg: 8 }, height: { xs: 6, lg: 8 }, borderRadius: '50%', bgcolor: tokens.primary }} />
      <Box sx={{ width: { xs: 6, lg: 8 }, height: { xs: 6, lg: 8 }, borderRadius: '50%', bgcolor: tokens.secondaryContainer }} />
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: { xs: 'column', lg: 'row' } }}>
      {/* ═══════════════ LEFT: BRANDING PANEL ═══════════════ */}
      <Box
        sx={{
          position: 'relative',
          width: { xs: '100%', lg: '50%' },
          minHeight: { xs: '35vh', lg: '100vh' },
          bgcolor: tokens.primary,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Mobile ellipse clip
          ...(!isDesktop && {
            clipPath: 'ellipse(150% 100% at 50% 0%)',
          }),
        }}
      >
        {/* BG image */}
        <Box
          component="img"
          src={HERO_IMG}
          alt="Traditional North East Indian textile"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: { xs: 0.3, lg: 0.4 },
            mixBlendMode: 'luminosity',
          }}
        />
        {/* Gradient overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(to top, ${tokens.primary}, ${alpha(tokens.primary, 0.6)}, transparent)`,
          }}
        />

        {/* Content */}
        <Box
          sx={{
            position: 'relative',
            zIndex: 10,
            p: { xs: 4, lg: 8 },
            textAlign: { xs: 'center', lg: 'left' },
            maxWidth: 640,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: { xs: 'center', lg: 'flex-start' }, mb: { xs: 2, lg: 4 } }}>
            <HatvoniLogo size={isDesktop ? 40 : 32} color={tokens.secondaryContainer} />
            <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '1.5rem', lg: '1.875rem' }, color: tokens.onPrimary, letterSpacing: '-0.01em' }}>
              Hatvoni
            </Typography>
          </Box>
          <Typography
            sx={{
              fontFamily: fonts.display,
              fontSize: { xs: '1.875rem', lg: '3.75rem' },
              lineHeight: 1.1,
              color: tokens.onPrimary,
              mb: { xs: 2, lg: 3 },
            }}
          >
            Preserving the Soul of the Seven Sisters.
          </Typography>
          <Typography
            sx={{
              display: { xs: 'none', sm: 'block' },
              fontFamily: fonts.body,
              fontSize: { xs: '1rem', lg: '1.25rem' },
              color: alpha(tokens.onPrimary, 0.8),
              maxWidth: 420,
              lineHeight: 1.6,
            }}
          >
            Join our community of modern ethnobotanists and culinary enthusiasts exploring the rare heritage of North East India.
          </Typography>
          {/* Progress dots */}
          <Box sx={{ display: 'flex', gap: 1, mt: { xs: 3, lg: 6 }, justifyContent: { xs: 'center', lg: 'flex-start' } }}>
            <Box sx={{ height: 4, width: { xs: 40, lg: 48 }, bgcolor: tokens.secondaryContainer, borderRadius: 99 }} />
            <Box sx={{ height: 4, width: { xs: 12, lg: 16 }, bgcolor: alpha(tokens.secondaryContainer, 0.3), borderRadius: 99 }} />
            <Box sx={{ height: 4, width: { xs: 12, lg: 16 }, bgcolor: alpha(tokens.secondaryContainer, 0.3), borderRadius: 99 }} />
          </Box>
        </Box>
      </Box>

      {/* ═══════════════ RIGHT: LOGIN FORM ═══════════════ */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: tokens.surface,
          px: { xs: 3, sm: 6 },
          py: { xs: 5, lg: 6 },
          width: { lg: '50%' },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 420 }}>
          {/* Back link */}
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: { xs: 4, lg: 5 },
                color: tokens.onSurfaceVariant,
                transition: 'color 0.2s',
                '&:hover': { color: tokens.primary },
                '&:hover .back-arrow': { transform: 'translateX(-4px)' },
              }}
            >
              <Icon className="back-arrow" sx={{ fontSize: { xs: 18, lg: 20 }, transition: 'transform 0.2s' }}>arrow_back</Icon>
              <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', lg: '0.75rem' }, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                Back to Main
              </Typography>
            </Box>
          </Link>

          {/* Heading */}
          <Box sx={{ mb: { xs: 4, lg: 5 } }}>
            <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '1.875rem', lg: '2.5rem' }, color: tokens.onSurface, mb: 1 }}>
              Welcome Back
            </Typography>
            <Typography sx={{ fontFamily: fonts.body, color: tokens.onSurfaceVariant, fontSize: { xs: '0.875rem', lg: '1rem' } }}>
              Sign in to access your curated botanical collection.
            </Typography>
          </Box>

          {/* Error */}
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
              {error}
            </Alert>
          )}

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, lg: 4 } }}>
            {/* Email */}
            <Box>
              <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', lg: '0.6875rem' }, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: tokens.onSurfaceVariant, mb: 1 }}>
                Email Address
              </Typography>
              <TextField
                id="login-email"
                type="email"
                required
                fullWidth
                variant="standard"
                placeholder="e.g. curator@hatvoni.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                InputProps={{
                  disableUnderline: true,
                  sx: {
                    fontFamily: fonts.body,
                    fontSize: { xs: '1rem', lg: '1.125rem' },
                    py: 1.5,
                    px: 0,
                    borderBottom: `2px solid ${tokens.outlineVariant}`,
                    transition: 'border-color 0.2s',
                    '&.Mui-focused': { borderColor: tokens.primary },
                    '& input::placeholder': { color: tokens.outline, opacity: 0.5 },
                  },
                }}
              />
            </Box>

            {/* Password */}
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', lg: '0.6875rem' }, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: tokens.onSurfaceVariant }}>
                  Password
                </Typography>
                <Link to="/forgot-password" style={{ textDecoration: 'none' }}>
                  <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', lg: '0.6875rem' }, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: tokens.primary, transition: 'color 0.2s', '&:hover': { color: tokens.secondary } }}>
                    Forgot?
                  </Typography>
                </Link>
              </Box>
              <TextField
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                fullWidth
                variant="standard"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  disableUnderline: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: tokens.onSurfaceVariant, '&:hover': { color: tokens.primary } }}>
                        <Icon>{showPassword ? 'visibility_off' : 'visibility'}</Icon>
                      </IconButton>
                    </InputAdornment>
                  ),
                  sx: {
                    fontFamily: fonts.body,
                    fontSize: { xs: '1rem', lg: '1.125rem' },
                    py: 1.5,
                    px: 0,
                    borderBottom: `2px solid ${tokens.outlineVariant}`,
                    transition: 'border-color 0.2s',
                    '&.Mui-focused': { borderColor: tokens.primary },
                    '& input::placeholder': { color: tokens.outline, opacity: 0.5 },
                  },
                }}
              />
            </Box>

            {/* Actions */}
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: { xs: 2, lg: 3 } }}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  py: { xs: 1.75, lg: 2.25 },
                  px: 4,
                  bgcolor: tokens.primary,
                  color: tokens.onPrimary,
                  fontFamily: fonts.headline,
                  fontSize: { xs: '1rem', lg: '1.125rem' },
                  fontWeight: 700,
                  borderRadius: 3,
                  boxShadow: `0 8px 24px ${alpha(tokens.primary, 0.2)}`,
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: alpha(tokens.primary, 0.9),
                    boxShadow: `0 12px 32px ${alpha(tokens.primary, 0.3)}`,
                  },
                  '&:active': { transform: 'scale(0.98)' },
                }}
              >
                {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Sign In to Hatvoni'}
              </Button>

              {/* Divider */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
                <Box sx={{ flex: 1, height: '1px', bgcolor: alpha(tokens.outlineVariant, 0.3) }} />
                <Typography sx={{ fontSize: { xs: '0.625rem', lg: '0.6875rem' }, fontWeight: 500, color: tokens.outline, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  OR
                </Typography>
                <Box sx={{ flex: 1, height: '1px', bgcolor: alpha(tokens.outlineVariant, 0.3) }} />
              </Box>

              {/* Google */}
              <Button
                fullWidth
                variant="outlined"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                startIcon={
                  googleLoading ? (
                    <CircularProgress size={20} />
                  ) : (
                    <Box component="img" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBZ6EOI2O3lkH60tifX6LhCLUtFR9HyHALGctV9cJL4GAW5JisfWbCAfmlv2FvJjvZqUeuYfu0CPnSGcmPWLEO7zHumy4dENzzZLp2fThW-7mV2ALWww9XREaD65aX880wXVoM4sldC9ujmdEJCXXABfywvmf-rdVQQJd5J66qrwepVlxZ4U0vXxNAUnr-wdtipG1-XwMVzcXF6TzFILpECO6ydxsR9Lc_YXroGiZTQW3oFBxBfUtpHg93rF2MLVYheZnhV-kmUNelA" alt="Google" sx={{ width: 20, height: 20 }} />
                  )
                }
                sx={{
                  py: { xs: 1.5, lg: 1.75 },
                  px: 4,
                  borderColor: alpha(tokens.outlineVariant, 0.5),
                  bgcolor: tokens.surfaceContainerLowest,
                  color: tokens.onSurface,
                  fontFamily: fonts.headline,
                  fontWeight: 600,
                  fontSize: { xs: '0.875rem', lg: '1rem' },
                  borderRadius: 3,
                  '&:hover': { bgcolor: tokens.surfaceContainerLow, borderColor: tokens.outlineVariant },
                }}
              >
                {googleLoading ? 'Connecting...' : 'Continue with Google'}
              </Button>
            </Box>
          </Box>

          {/* Sign up link */}
          <Box sx={{ mt: { xs: 4, lg: 6 }, textAlign: 'center' }}>
            <Typography sx={{ fontFamily: fonts.body, color: tokens.onSurfaceVariant, fontSize: { xs: '0.875rem', lg: '1rem' } }}>
              Don't have an account?{' '}
              <Link to="/signup" style={{ textDecoration: 'none', color: tokens.primary, fontWeight: 700, marginLeft: 4 }}>
                Create an account
              </Link>
            </Typography>
          </Box>
        </Box>

        {/* Accent dots */}
        <AccentDots />
      </Box>
    </Box>
  );
}
