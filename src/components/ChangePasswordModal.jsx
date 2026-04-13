import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { updatePassword, signIn, user } = useAuth();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.newPassword)) {
      newErrors.newPassword = 'Password must contain uppercase, lowercase, and number';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (formData.currentPassword === formData.newPassword) {
      newErrors.newPassword = 'New password must be different from current password';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      const { error: signInError } = await signIn(user.email, formData.currentPassword);

      if (signInError) {
        setErrors({ currentPassword: 'Current password is incorrect' });
        setLoading(false);
        return;
      }

      const { error: updateError } = await updatePassword(formData.newPassword);

      if (updateError) {
        setErrors({ general: updateError.message || 'Failed to update password' });
        setLoading(false);
        return;
      }

      setSuccess(true);
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });

      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch {
      setErrors({ general: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setErrors({});
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-surface rounded-2xl max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-primary text-on-primary p-6 md:p-8 rounded-t-2xl flex justify-between items-center border-b border-primary-container">
          <h2 className="font-headline text-2xl md:text-3xl font-extrabold tracking-tight">
            Change Password
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-primary-container/20 rounded-full transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center space-x-2">
              <span className="material-symbols-outlined text-green-600">check_circle</span>
              <span className="font-headline font-semibold">Password changed successfully!</span>
            </div>
          )}

          {errors.general && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center space-x-2">
              <span className="material-symbols-outlined text-red-600">error</span>
              <span className="font-headline font-semibold">{errors.general}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
              Current Password
            </label>
            <input
              type="password"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              disabled={loading || success}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all disabled:opacity-50"
            />
            {errors.currentPassword && <p className="text-error text-sm mt-1">{errors.currentPassword}</p>}
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
              New Password
            </label>
            <input
              type="password"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              disabled={loading || success}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all disabled:opacity-50"
            />
            {errors.newPassword && <p className="text-error text-sm mt-1">{errors.newPassword}</p>}
            <p className="text-xs text-on-surface-variant mt-2">
              Must be at least 8 characters with uppercase, lowercase, and number
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading || success}
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all disabled:opacity-50"
            />
            {errors.confirmPassword && <p className="text-error text-sm mt-1">{errors.confirmPassword}</p>}
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading || success}
              className="flex-1 px-6 py-3 rounded-lg font-headline font-bold text-on-surface bg-surface-container-low hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex-1 px-6 py-3 rounded-lg font-headline font-bold text-white bg-secondary hover:bg-secondary/90 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span>Updating...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
