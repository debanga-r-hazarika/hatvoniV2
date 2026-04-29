import { useEffect, useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

export default function RequiredPhoneDialog({ open }) {
  const { user, profile, refreshProfile } = useAuth();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const normalizedPhone = useMemo(() => String(phone || '').trim(), [phone]);

  useEffect(() => {
    if (!open) return;
    setPhone(profile?.phone || '');
    setError('');
  }, [open, profile?.phone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!normalizedPhone) {
      setError('Phone number is required.');
      return;
    }

    if (!PHONE_REGEX.test(normalizedPhone)) {
      setError('Enter a valid phone number with 8 to 15 digits.');
      return;
    }

    if (!user?.id) {
      setError('Session not found. Please sign in again.');
      return;
    }

    setSaving(true);
    const { error: saveError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email || null,
          phone: normalizedPhone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
  };

  return (
    <Dialog open={open} disableEscapeKeyDown maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Complete your account</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Phone number is mandatory to continue.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            autoFocus
            required
            fullWidth
            label="Phone number"
            placeholder="+919876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={saving}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Continue'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
