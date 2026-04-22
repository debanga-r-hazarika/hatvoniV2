import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Icon from '@mui/material/Icon';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { tokens, fonts } from '../theme/hatvoniTheme';

/* ── Heritage panel background image ──────────────────── */
const HERO_IMG =
  'https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=1470&auto=format&fit=crop';

export default function Signup() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    const { error: googleError } = await signInWithGoogle();
    if (googleError) {
      setError(googleError.message);
      setGoogleLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const hasLowercase = /[a-z]/.test(formData.password);
    const hasUppercase = /[A-Z]/.test(formData.password);
    const hasDigit = /[0-9]/.test(formData.password);

    if (!hasLowercase || !hasUppercase || !hasDigit) {
      setError('Password must contain lowercase, uppercase letters, and digits');
      setLoading(false);
      return;
    }

    const { data, error: signUpError } = await signUp(
      formData.email,
      formData.password,
      { first_name: formData.firstName, last_name: formData.lastName }
    );

    if (signUpError) {
      if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
        setError('Sorry, you are already registered with this email address. Please sign in or reset your password if you forgot it.');
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => navigate('/confirm-account', {
        state: {
          email: formData.email,
          needsConfirmation: data?.user?.identities?.length === 0
        }
      }), 1500);
    }
  };

  /* ── Styled underline input ─────────────────────────── */
  const UnderlineInput = ({ label, id, ...rest }) => (
    <Box>
      <Typography
        sx={{
          fontFamily: fonts.label,
          fontSize: { xs: '0.625rem', md: '0.6875rem' },
          fontWeight: 700,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: tokens.secondary,
          mb: 1,
        }}
      >
        {label}
      </Typography>
      <TextField
        id={id}
        fullWidth
        variant="standard"
        InputProps={{
          disableUnderline: true,
          sx: {
            fontFamily: fonts.headline,
            fontSize: { xs: '1rem', md: '1.125rem' },
            py: 1.5,
            px: 0,
            borderBottom: `2px solid ${tokens.outlineVariant}`,
            transition: 'border-color 0.2s',
            '&.Mui-focused': { borderColor: tokens.primary },
            '& input::placeholder': { color: alpha(tokens.outlineVariant, 0.6), opacity: 1 },
          },
        }}
        {...rest}
      />
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Main Grid ────────────────────────────────────── */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '5fr 7fr', lg: '4fr 8fr' },
          minHeight: '100vh',
        }}
      >
        {/* ═══════ LEFT BRAND PANEL (Desktop) ═══════ */}
        {isDesktop && (
          <Box
            sx={{
              position: 'relative',
              bgcolor: tokens.primaryContainer,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              p: { md: 6, lg: 6 },
            }}
          >
            {/* BG image */}
            <Box component="img" src={HERO_IMG} alt="Heritage Visual" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4, mixBlendMode: 'luminosity' }} />
            <Box sx={{ position: 'absolute', inset: 0, background: `linear-gradient(to bottom, ${alpha(tokens.primaryContainer, 0.6)}, ${alpha(tokens.primaryContainer, 0.8)}, ${tokens.primaryContainer})` }} />

            {/* Top Logo */}
            <Box sx={{ position: 'relative', zIndex: 10 }}>
              <Link to="/" style={{ textDecoration: 'none' }}>
                <Typography sx={{ fontFamily: fonts.display, fontSize: '1.875rem', color: tokens.secondaryContainer, letterSpacing: '-0.02em' }}>
                  Hatvoni
                </Typography>
              </Link>
            </Box>

            {/* Bottom Content */}
            <Box sx={{ position: 'relative', zIndex: 10, mt: 'auto' }}>
              <Typography sx={{ fontFamily: fonts.display, fontSize: { md: '2.5rem', lg: '3rem' }, lineHeight: 1.1, color: '#fff', mb: 3 }}>
                Join the heritage community.
              </Typography>
              <Typography sx={{ fontFamily: fonts.headline, fontSize: '1.125rem', color: tokens.onPrimaryContainer, maxWidth: 380, lineHeight: 1.6 }}>
                Preserving the ethnobotanical wisdom of the Seven Sisters, delivered to your doorstep.
              </Typography>
              {/* Cultural accent */}
              <Box sx={{ display: 'flex', gap: 1, mt: 6 }}>
                <Box sx={{ height: 4, width: 48, bgcolor: tokens.secondaryContainer }} />
                <Box sx={{ height: 4, width: 16, bgcolor: tokens.tertiary }} />
                <Box sx={{ height: 4, width: 8, bgcolor: tokens.secondaryFixedDim }} />
              </Box>
            </Box>
          </Box>
        )}

        {/* ═══════ RIGHT FORM PANEL ═══════ */}
        <Box
          component="section"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: { xs: 3, md: 8, lg: 12 },
            bgcolor: tokens.surface,
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: { xs: 4, md: 5 } }}>
            {/* Mobile logo */}
            {!isDesktop && (
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontFamily: fonts.display, fontSize: '1.5rem', color: tokens.primary }}>
                  Hatvoni
                </Typography>
                <Link to="/login" style={{ textDecoration: 'none', color: tokens.primary, fontFamily: fonts.label, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  Login
                </Link>
              </Box>
            )}

            {/* Back link */}
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: { xs: 4, md: 5 },
                  color: tokens.onSurfaceVariant,
                  transition: 'color 0.2s',
                  '&:hover': { color: tokens.primary },
                  '&:hover .back-arrow': { transform: 'translateX(-4px)' },
                }}
              >
                <Icon className="back-arrow" sx={{ fontSize: { xs: 18, md: 20 }, transition: 'transform 0.2s' }}>arrow_back</Icon>
                <Typography sx={{ fontFamily: fonts.label, fontSize: { xs: '0.625rem', md: '0.75rem' }, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  Back to Main
                </Typography>
              </Box>
            </Link>

            {/* Header */}
            <Box>
              <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: '1.875rem', md: '2rem' }, color: tokens.primary, letterSpacing: '-0.01em' }}>
                Create Account
              </Typography>
              <Typography sx={{ fontFamily: fonts.body, color: tokens.onSurfaceVariant, mt: 0.5, fontSize: { xs: '0.875rem', md: '1rem' } }}>
                Become a part of our curated botanical journey.
              </Typography>
              {/* Mobile accent */}
              {!isDesktop && (
                <Box sx={{ display: 'flex', gap: 0.5, mt: 2 }}>
                  <Box sx={{ height: 4, width: 32, bgcolor: tokens.primary }} />
                  <Box sx={{ height: 4, width: 8, bgcolor: tokens.secondaryContainer }} />
                </Box>
              )}
            </Box>

            {/* Errors / Success */}
            {error && (
              <Alert
                severity="error"
                sx={{ borderRadius: 3 }}
                action={
                  error.includes('already registered') ? (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Link to="/login" style={{ color: theme.palette.error.main, fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'underline' }}>Sign in</Link>
                      <Link to="/forgot-password" style={{ color: theme.palette.error.main, fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'underline' }}>Reset password</Link>
                    </Box>
                  ) : undefined
                }
              >
                {error}
              </Alert>
            )}
            {success && (
              <Alert severity="success" sx={{ borderRadius: 3 }}>
                Account created successfully! Setting up your profile...
              </Alert>
            )}

            {/* Form */}
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 } }}>
              <UnderlineInput
                label="Full Name"
                id="signup-name"
                name="firstName"
                placeholder="Aishee Sharma"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value, lastName: '' })}
              />
              <UnderlineInput
                label="Email Address"
                id="signup-email"
                name="email"
                type="email"
                placeholder="aishee@heritage.com"
                required
                value={formData.email}
                onChange={handleChange}
              />
              <UnderlineInput
                label="Password"
                id="signup-password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                value={formData.password}
                onChange={handleChange}
              />
              <UnderlineInput
                label="Confirm Password"
                id="signup-confirm-password"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
              />

              {/* Terms */}
              <FormControlLabel
                control={
                  <Checkbox
                    required
                    checked={termsChecked}
                    onChange={(e) => setTermsChecked(e.target.checked)}
                    sx={{
                      color: tokens.outlineVariant,
                      '&.Mui-checked': { color: tokens.primary },
                      alignSelf: 'flex-start',
                      mt: -0.5,
                    }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ color: tokens.onSurfaceVariant, lineHeight: 1.5 }}>
                    I agree to the{' '}
                    <Link to="/terms-conditions" style={{ fontWeight: 600, color: tokens.secondary, textDecoration: 'none' }}>Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy-policy" style={{ fontWeight: 600, color: tokens.secondary, textDecoration: 'none' }}>Privacy Policy</Link>.
                  </Typography>
                }
                sx={{ alignItems: 'flex-start' }}
              />

              {/* CTA */}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                endIcon={!loading && <Icon>arrow_forward</Icon>}
                sx={{
                  py: { xs: 1.75, md: 2.25 },
                  bgcolor: tokens.primaryContainer,
                  color: tokens.onPrimaryContainer,
                  fontFamily: fonts.headline,
                  fontWeight: 700,
                  fontSize: { xs: '1rem', md: '1.125rem' },
                  borderRadius: 3,
                  boxShadow: `0 10px 40px -10px ${alpha(tokens.onSurface, 0.15)}`,
                  transition: 'all 0.2s',
                  '&:hover': { bgcolor: tokens.primary },
                  '&:active': { transform: 'scale(0.98)' },
                }}
              >
                {loading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Create Account'}
              </Button>

              {/* Divider */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
                <Box sx={{ flex: 1, height: '1px', bgcolor: alpha(tokens.outlineVariant, 0.3) }} />
                <Typography sx={{ fontSize: { xs: '0.625rem', md: '0.6875rem' }, fontWeight: 500, color: tokens.outline, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
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
                    <Box component="img" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" sx={{ width: 20, height: 20 }} />
                  )
                }
                sx={{
                  py: { xs: 1.5, md: 1.75 },
                  px: 4,
                  borderColor: alpha(tokens.outlineVariant, 0.5),
                  bgcolor: tokens.surfaceContainerLowest,
                  color: tokens.onSurface,
                  fontFamily: fonts.headline,
                  fontWeight: 600,
                  fontSize: { xs: '0.875rem', md: '1rem' },
                  borderRadius: 3,
                  '&:hover': { bgcolor: tokens.surfaceContainerLow, borderColor: tokens.outlineVariant },
                }}
              >
                {googleLoading ? 'Connecting...' : 'Continue with Google'}
              </Button>

            </Box>

            {/* Footer link */}
            <Box sx={{ textAlign: 'center', pt: 4, borderTop: `1px solid ${alpha(tokens.outlineVariant, 0.2)}` }}>
              <Typography sx={{ color: tokens.onSurfaceVariant }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: tokens.primary, fontWeight: 700, textDecoration: 'none', marginLeft: 4 }}>
                  Log in
                </Link>
              </Typography>
            </Box>
          </Box>
        </Box>
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
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: { xs: 'center', md: 'flex-start' } }}>
          <Typography sx={{ fontFamily: fonts.display, fontSize: '1.25rem', color: tokens.surface }}>Hatvoni</Typography>
          <Typography sx={{ fontSize: '0.625rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: alpha(tokens.surface, 0.6), fontFamily: fonts.body }}>
            © 2024 Hatvoni. The Modern Ethnobotanist.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: { xs: 3, md: 4 } }}>
          {['Privacy Policy', 'Terms of Service', 'Contact Us', 'Shipping Info'].map((item) => (
            <Typography key={item} component="a" href="#" sx={{ color: alpha(tokens.surface, 0.8), fontSize: '0.6875rem', fontFamily: fonts.label, letterSpacing: '0.15em', textTransform: 'uppercase', textDecoration: 'none', transition: 'color 0.2s', '&:hover': { color: tokens.secondaryContainer } }}>
              {item}
            </Typography>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.secondaryContainer }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tokens.tertiary }} />
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: alpha(tokens.secondaryContainer, 0.4) }} />
        </Box>
      </Box>
    </Box>
  );
}
