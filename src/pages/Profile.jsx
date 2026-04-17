import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { addressService } from '../services/addressService';
import { avatarService } from '../services/avatarService';
import AddressModal from '../components/AddressModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import ProfileMobileView from '../components/ProfileMobileView';
import AccountSidebar from '../components/AccountSidebar';

export default function Profile() {
  const [newsletter, setNewsletter] = useState(true);
  const [sms, setSms] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addresses, setAddresses] = useState([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: ''
  });
  const { user, signOut, refreshProfile, isEmployee, employeeModules } = useAuth();
  const navigate = useNavigate();

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    try {
      console.log('Fetching profile for user:', user.id);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      console.log('Profile fetch result:', { data, error });

      if (error) {
        console.error('Profile fetch error:', error);
        throw error;
      }

      if (data) {
        console.log('Setting profile data:', data);
        setProfile(data);
        const newFormData = {
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          email: data.email || user.email || '',
          phone: data.phone || ''
        };
        console.log('Setting form data:', newFormData);
        setFormData(newFormData);
      } else {
        console.warn('No profile data returned');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      alert('Error loading profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchAddresses = useCallback(async () => {
    if (!user) return;
    try {
      const data = await addressService.getAddresses(user.id);
      setAddresses(data);
    } catch (error) {
      console.error('Error fetching addresses:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchProfile();
    fetchAddresses();
  }, [user, navigate, fetchProfile, fetchAddresses]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSaveChanges = async () => {
    try {
      console.log('Updating profile with data:', {
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        user_id: user.id
      });

      const { data, error } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select();

      console.log('Update result:', { data, error });

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      // Customer sync is handled server-side by DB triggers.

      alert('Profile updated successfully!');
      await fetchProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const handleAddAddress = () => {
    setEditingAddress(null);
    setShowAddressModal(true);
  };

  const handleEditAddress = (address) => {
    setEditingAddress(address);
    setShowAddressModal(true);
  };

  const handleSaveAddress = async (addressData) => {
    try {
      if (editingAddress) {
        await addressService.updateAddress(editingAddress.id, addressData);
      } else {
        await addressService.createAddress(user.id, addressData);
      }
      await fetchAddresses();
      setShowAddressModal(false);
      setEditingAddress(null);
    } catch (error) {
      console.error('Error saving address:', error);
      alert('Failed to save address');
    }
  };

  const handleDeleteAddress = async (addressId) => {
    if (!confirm('Are you sure you want to delete this address?')) return;

    try {
      await addressService.deleteAddress(addressId);
      await fetchAddresses();
    } catch (error) {
      console.error('Error deleting address:', error);
      alert('Failed to delete address');
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Please select a JPG, PNG, or WebP image');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB');
      return;
    }

    setAvatarUploading(true);
    try {
      const avatarUrl = await avatarService.uploadAvatar(user.id, file);
      setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
      await refreshProfile();
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload photo');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm('Remove your profile photo?')) return;
    setAvatarUploading(true);
    try {
      await avatarService.removeAvatar(user.id);
      setProfile(prev => ({ ...prev, avatar_url: null }));
      await refreshProfile();
    } catch (error) {
      console.error('Error removing avatar:', error);
      alert('Failed to remove photo');
    } finally {
      setAvatarUploading(false);
    }
  };

  const isAdmin = profile?.is_admin === true;
  const isSeller = profile?.is_seller === true;

  const employeeModuleRoutes = {
    orders: '/admin/orders',
    support: '/admin/support',
    inventory: '/admin/inventory',
    coupons: '/admin/coupons',
    logistics: '/admin/logistics',
    sellers: '/admin/sellers',
    customers: '/admin',
    products: '/admin',
    lots: '/admin',
    recipes: '/admin',
  };

  const employeeAdminLink = employeeModules.reduce((route, moduleName) => {
    if (route) return route;
    return employeeModuleRoutes[String(moduleName || '').trim().toLowerCase()] || null;
  }, null) || '/admin';

  const sidebarLinks = [
    { label: 'Personal Details', href: '/profile', icon: 'person', active: true },
    { label: 'My Orders', href: '/orders', icon: 'package_2', active: false },
    { label: 'Support', href: '/support', icon: 'support_agent', active: false },
    { label: 'Wishlist', href: '/wishlist', icon: 'favorite', active: false },
    ...(isSeller ? [{ label: 'Seller Panel', href: '/seller', icon: 'storefront', active: false, admin: true }] : []),
    ...(isAdmin ? [{ label: 'Admin Panel', href: '/admin', icon: 'admin_panel_settings', active: false, admin: true }] : []),
    ...((isAdmin || employeeModules.includes('support'))
      ? [{ label: 'Support Queue', href: '/admin/support', icon: 'support_agent', active: false, admin: true }]
      : []),
    ...(!isAdmin && isEmployee ? [{ label: 'Staff Panel', href: employeeAdminLink, icon: 'badge', active: false, admin: true }] : []),
    { label: 'Log Out', onClick: handleLogout, icon: 'logout', active: false, danger: true },
  ];

  const getFullName = () => {
    const parts = [formData.first_name, formData.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'User';
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  if (loading) {
    return (
      <main className="pt-32 pb-24 md:pt-40 md:pb-16 bg-surface min-h-screen">
        <div className="max-w-screen-xl mx-auto px-6 md:px-12 py-8 md:py-16">
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-lg text-slate-600">Loading profile...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-32 pb-24 md:pt-40 md:pb-16 bg-surface min-h-screen">
      <ProfileMobileView
        profile={profile}
        formData={formData}
        addresses={addresses}
        avatarUploading={avatarUploading}
        fileInputRef={fileInputRef}
        onAvatarUpload={handleAvatarUpload}
        onInputChange={handleInputChange}
        onSave={handleSaveChanges}
        onAddAddress={handleAddAddress}
        onEditAddress={handleEditAddress}
        onDeleteAddress={handleDeleteAddress}
        onPasswordModal={() => setShowPasswordModal(true)}
        onLogout={handleLogout}
        getFullName={getFullName}
      />

      <div className="hidden lg:block max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="mb-10 md:mb-16">
          <h1 className="font-brand text-5xl md:text-6xl text-primary leading-[0.94] tracking-tighter uppercase">My Profile</h1>
          <p className="font-headline text-on-surface-variant text-base md:text-lg leading-relaxed mt-3 md:mt-4 max-w-2xl">
            Manage your account details, delivery addresses, and preferences in one place.
          </p>
          <div className="w-24 md:w-32 h-1.5 md:h-2 bg-secondary mt-5 md:mt-6" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          <AccountSidebar />

          <section className="space-y-10 md:space-y-12">
            <div className="bg-surface rounded-2xl border border-outline-variant/30 p-8 md:p-10 transition-all duration-300 hover:shadow-md hover:border-outline-variant/50">
              <h2 className="font-headline text-2xl md:text-3xl font-extrabold text-on-surface mb-8 md:mb-10 tracking-tight leading-tight">Personal Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="bg-surface-container-low p-8 md:p-10 rounded-xl space-y-6 md:space-y-8 relative overflow-hidden transition-all duration-300 hover:shadow-lg">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><span className="material-symbols-outlined text-7xl md:text-8xl">ecg_heart</span></div>
                  <div className="space-y-5 md:space-y-6">
                    <div className="border-b border-outline-variant pb-2">
                      <label className="block text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-1">First Name</label>
                      <input
                        className="w-full bg-transparent border-none p-0 text-lg md:text-xl leading-snug font-headline font-semibold focus:ring-0 text-on-surface outline-none"
                        type="text"
                        name="first_name"
                        value={formData.first_name}
                        onChange={handleInputChange}
                        placeholder="First name"
                      />
                    </div>
                    <div className="border-b border-outline-variant pb-2">
                      <label className="block text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-1">Last Name</label>
                      <input
                        className="w-full bg-transparent border-none p-0 text-lg md:text-xl leading-snug font-headline font-semibold focus:ring-0 text-on-surface outline-none"
                        type="text"
                        name="last_name"
                        value={formData.last_name}
                        onChange={handleInputChange}
                        placeholder="Last name"
                      />
                    </div>
                    <div className="border-b border-outline-variant pb-2">
                      <label className="block text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-1">Email Address</label>
                      <input
                        className="w-full bg-transparent border-none p-0 text-lg md:text-xl leading-snug font-headline font-semibold focus:ring-0 text-on-surface outline-none"
                        type="email"
                        value={formData.email}
                        disabled
                      />
                    </div>
                    <div className="border-b border-outline-variant pb-2">
                      <label className="block text-[10px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-1">Contact Number</label>
                      <input
                        className="w-full bg-transparent border-none p-0 text-lg md:text-xl leading-snug font-headline font-semibold focus:ring-0 text-on-surface outline-none"
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleSaveChanges}
                    className="bg-primary text-on-primary px-6 md:px-8 py-3 md:py-4 rounded-xl font-headline font-bold text-sm tracking-wide leading-none hover:bg-primary-container transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-low"
                  >
                    Save Changes
                  </button>
                </div>
                <div className="relative rounded-xl overflow-hidden aspect-square md:aspect-auto min-h-[200px] bg-surface-container flex items-center justify-center transition-all duration-300 hover:shadow-lg">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  {profile?.avatar_url ? (
                    <img
                      className="w-full h-full object-contain bg-surface-container"
                      alt="Profile"
                      src={profile.avatar_url}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-on-surface-variant/40">
                      <span className="material-symbols-outlined text-8xl">account_circle</span>
                      <p className="font-headline text-sm mt-2">No photo yet</p>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/35 backdrop-blur-[2px] flex items-end p-6 md:p-8">
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="flex items-center space-x-2 text-white/90 hover:text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-primary/40 rounded-md px-1"
                      >
                        <span className="material-symbols-outlined">{avatarUploading ? 'progress_activity' : 'photo_camera'}</span>
                        <span className="font-headline font-bold uppercase text-xs tracking-widest">
                          {avatarUploading ? 'Uploading...' : profile?.avatar_url ? 'Change Photo' : 'Upload Photo'}
                        </span>
                      </button>
                      {profile?.avatar_url && !avatarUploading && (
                        <button
                          onClick={handleRemoveAvatar}
                          className="flex items-center space-x-1 text-white/60 hover:text-white/90 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-md px-1"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          <span className="font-headline font-bold uppercase text-[10px] tracking-widest">Remove</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-outline-variant/30 p-8 md:p-10 transition-all duration-300 hover:shadow-md hover:border-outline-variant/50">
              <div className="flex justify-between items-end mb-8 md:mb-10">
                <h2 className="font-headline text-2xl md:text-3xl font-extrabold text-on-surface tracking-tight leading-tight">Address Book</h2>
                <button
                  onClick={handleAddAddress}
                  className="flex items-center space-x-2 text-secondary hover:text-on-secondary-fixed-variant transition-all duration-200 group hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-md px-2 py-1"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  <span className="font-headline font-bold uppercase text-xs tracking-widest hidden md:inline">Add New Address</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {addresses.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <span className="material-symbols-outlined text-6xl text-on-surface-variant opacity-30">location_off</span>
                    <p className="text-on-surface-variant mt-4 font-headline">No addresses saved yet</p>
                    <button
                      onClick={handleAddAddress}
                      className="mt-4 px-6 py-3 bg-secondary text-white rounded-lg font-headline font-bold hover:bg-secondary/90 transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      Add Your First Address
                    </button>
                  </div>
                ) : (
                  addresses.map(addr => (
                    <div key={addr.id} className="bg-surface-container-low p-6 md:p-8 rounded-xl border border-outline-variant/30 hover:border-secondary transition-all duration-300 hover:-translate-y-1 hover:shadow-lg relative group">
                      <div className="absolute top-4 md:top-6 right-4 md:right-6 flex space-x-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditAddress(addr)}
                          className="material-symbols-outlined text-on-surface-variant hover:text-primary text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 rounded"
                        >
                          edit
                        </button>
                        <button
                          onClick={() => handleDeleteAddress(addr.id)}
                          className="material-symbols-outlined text-on-surface-variant hover:text-error text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error/70 rounded"
                        >
                          delete
                        </button>
                      </div>
                      {addr.is_default && (
                        <span className="inline-block bg-secondary-container text-on-secondary-container px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest mb-3 md:mb-4">
                          Default Shipping
                        </span>
                      )}
                      <p className="font-headline font-bold text-base md:text-lg leading-snug mb-2 text-on-surface">{addr.title}</p>
                      <p className="text-on-surface-variant leading-relaxed font-medium text-sm md:text-[15px]">
                        {addr.address_line1}
                        {addr.address_line2 && <><br />{addr.address_line2}</>}
                        <br />{addr.city}, {addr.state}
                        <br />{addr.postal_code}, {addr.country}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-primary text-on-primary p-8 md:p-12 rounded-2xl overflow-hidden relative">
              <div className="absolute bottom-0 right-0 w-48 md:w-64 h-48 md:h-64 bg-[#00643c] rounded-full translate-x-1/2 translate-y-1/2 opacity-20 blur-3xl" />
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
                <div className="space-y-6 md:space-y-8">
                  <h2 className="font-headline text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">Security &amp; Privacy</h2>
                  <div className="space-y-5 md:space-y-6">
                    <button
                      onClick={() => setShowPasswordModal(true)}
                      className="w-full flex items-center justify-between group cursor-pointer border-b border-on-primary-container/20 pb-4 text-left transition-all duration-200 hover:pl-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-container/70 rounded-md"
                    >
                      <div>
                        <p className="font-headline font-bold text-base md:text-lg leading-snug">Change Password</p>
                        <p className="text-on-primary-container text-xs md:text-sm leading-relaxed">Update your account password</p>
                      </div>
                      <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward_ios</span>
                    </button>
                    <div className="flex items-center justify-between group cursor-pointer border-b border-on-primary-container/20 pb-4 transition-all duration-200 hover:pl-1">
                      <div>
                        <p className="font-headline font-bold text-base md:text-lg leading-snug">Two-Factor Authentication</p>
                        <p className="text-on-primary-container text-xs md:text-sm leading-relaxed">Enabled for extra protection</p>
                      </div>
                      <span className="material-symbols-outlined text-secondary-container" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-6 md:space-y-8">
                  <h2 className="font-headline text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">Preferences</h2>
                  <div className="space-y-5 md:space-y-6">
                    <div className="flex items-center justify-between cursor-pointer group transition-all duration-200 hover:pl-1" onClick={() => setNewsletter(!newsletter)}>
                      <div>
                        <p className="font-headline font-bold text-base md:text-lg leading-snug">Newsletter Subscription</p>
                        <p className="text-on-primary-container text-xs md:text-sm leading-relaxed">Receive heritage recipes and news</p>
                      </div>
                      <div className={`w-10 md:w-12 h-5 md:h-6 ${newsletter ? 'bg-primary-container' : 'bg-on-primary-container/30'} rounded-full relative p-1 transition-colors`}>
                        <div className={`w-3 md:w-4 h-3 md:h-4 bg-white rounded-full transition-all ${newsletter ? 'translate-x-5 md:translate-x-6' : 'translate-x-0'}`} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between cursor-pointer group transition-all duration-200 hover:pl-1" onClick={() => setSms(!sms)}>
                      <div>
                        <p className="font-headline font-bold text-base md:text-lg leading-snug">SMS Notifications</p>
                        <p className="text-on-primary-container text-xs md:text-sm leading-relaxed">Order updates and delivery tracking</p>
                      </div>
                      <div className={`w-10 md:w-12 h-5 md:h-6 ${sms ? 'bg-primary-container' : 'bg-on-primary-container/30'} rounded-full relative p-1 transition-colors`}>
                        <div className={`w-3 md:w-4 h-3 md:h-4 bg-white rounded-full transition-all ${sms ? 'translate-x-5 md:translate-x-6' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <AddressModal
        isOpen={showAddressModal}
        onClose={() => {
          setShowAddressModal(false);
          setEditingAddress(null);
        }}
        onSave={handleSaveAddress}
        address={editingAddress}
      />

      <ChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />
    </main>
  );
}
