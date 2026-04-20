import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha, useTheme } from '@mui/material/styles';

export default function ResetPassword() {
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    const { error: updateError } = await updatePassword(password);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
    } else {
      navigate('/login');
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: theme.palette.hatvoni.surfaceContainerLow,
        py: 6,
        px: 2,
      }}
    >
      <Box sx={{ maxWidth: 440, width: '100%' }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 6,
            border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.35)}`,
            p: { xs: 4, sm: 5 },
            bgcolor: theme.palette.hatvoni.surfaceContainerLowest,
            boxShadow: `0 20px 60px ${alpha(theme.palette.primary.main, 0.06)}`,
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                mx: 'auto',
                width: 64,
                height: 64,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: theme.palette.primary.main }}>lock_reset</span>
            </Box>
            <Typography variant="h5" sx={{ color: 'text.primary', fontWeight: 700, mb: 0.5 }}>
              Set new password
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Your new password must be different from previously used passwords
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              id="password"
              label="New password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              helperText="Must be at least 6 characters"
            />

            <TextField
              id="confirmPassword"
              label="Confirm new password"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                bgcolor: theme.palette.hatvoni.surfaceContainerLow,
                border: `1px solid ${alpha(theme.palette.hatvoni.outlineVariant, 0.3)}`,
                borderRadius: 3,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
                Password requirements:
              </Typography>
              <Box component="ul" sx={{ pl: 2, m: 0, listStyle: 'disc' }}>
                <Typography component="li" variant="caption" sx={{ color: 'text.secondary', mb: 0.25 }}>
                  At least 6 characters
                </Typography>
                <Typography component="li" variant="caption" sx={{ color: 'text.secondary' }}>
                  Both passwords match
                </Typography>
              </Box>
            </Paper>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{ py: 1.5, borderRadius: 3, fontWeight: 600, fontSize: '0.9375rem' }}
            >
              {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Reset password'}
            </Button>
          </Box>
        </Paper>

        <Typography variant="caption" sx={{ display: 'block', mt: 3, textAlign: 'center', color: 'text.secondary' }}>
          Remember your password?{' '}
          <Box
            component="button"
            onClick={() => navigate('/login')}
            sx={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              color: 'primary.main',
              textDecoration: 'underline',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            Back to login
          </Box>
        </Typography>
      </Box>
    </Box>
  );
}
