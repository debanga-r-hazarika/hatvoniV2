import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

function useOutsideClick(ref, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

function MobileBottomNav() {
  const location = useLocation();
  const path = location.pathname;

  const links = [
    { to: '/', icon: 'home', label: 'Home' },
    { to: '/products', icon: 'shopping_bag', label: 'Products' },
    { to: '/traditions', icon: 'auto_stories', label: 'Traditions' },
    { to: '/profile', icon: 'person', label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-md border-t border-outline-variant/20 rounded-t-[22px] shadow-[0_-8px_28px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around px-2 pt-2 pb-2">
        {links.map(({ to, icon, label }) => {
          const active = path === to || (to !== '/' && path.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 mx-0.5 rounded-2xl transition-all duration-200 press-effect ${
                active ? 'text-on-secondary-container bg-secondary-container' : 'text-on-surface-variant/65'
              }`}
            >
              <span className="relative flex items-center justify-center w-9 h-7 rounded-full transition-all duration-200">
                <span className={`material-symbols-outlined transition-all duration-200 ${
                  active ? 'text-[21px]' : 'text-[20px]'
                }`}
                  style={{ fontVariationSettings: active ? "'FILL' 1, 'wght' 650" : "'FILL' 0, 'wght' 450" }}>
                  {icon}
                </span>
              </span>
              <span className={`text-[10px] font-headline font-bold uppercase tracking-wide leading-none transition-all duration-200 ${
                active ? 'text-on-secondary-container' : 'text-on-surface-variant/70'
              }`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AvatarSection({ profile, avatarUploading, fileInputRef, onUpload, getFullName }) {
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="flex flex-col items-center pt-8 pb-7 animate-fade-up">
      <div className="relative animate-scale-in">
        <div className="w-[114px] h-[114px] rounded-full overflow-hidden bg-surface-container ring-[5px] ring-primary/18 shadow-lg shadow-primary/10">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Profile"
              className="w-full h-full object-contain bg-surface-container transition-transform duration-500"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-container to-surface-container-high">
              <span className="material-symbols-outlined text-on-surface-variant/40"
                style={{ fontSize: '56px', fontVariationSettings: "'FILL' 1" }}>
                account_circle
              </span>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onUpload}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={avatarUploading}
          className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-secondary-container border-2 border-surface flex items-center justify-center shadow-md transition-all duration-200 active:scale-95 disabled:opacity-50"
        >
          <span
            className={`material-symbols-outlined text-on-secondary-container transition-all ${avatarUploading ? 'animate-spin' : ''}`}
            style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1, 'wght' 700" }}
          >
            {avatarUploading ? 'progress_activity' : 'edit'}
          </span>
        </button>
      </div>

      <h2 className="font-headline font-extrabold text-[22px] text-on-surface mt-5 tracking-tight leading-[1.05]">
        {getFullName()}
      </h2>
      {memberSince && (
        <p className="text-on-surface-variant text-[14px] font-body mt-2 tracking-wide leading-relaxed">
          Member since {memberSince}
        </p>
      )}
    </div>
  );
}


function InfoRow({ label, value, isLast = false }) {
  return (
    <div className={`pb-3 ${isLast ? '' : 'mb-6'}`}>
      <p className="text-[12px] uppercase tracking-[0.14em] font-headline font-black text-on-surface-variant/80 leading-none mb-3">
        {label}
      </p>
      <p className="font-headline font-medium text-[16px] text-on-surface leading-relaxed break-words">
        {value || '-'}
      </p>
      {!isLast && <div className="h-px bg-outline-variant/55 mt-3" />}
    </div>
  );
}

function PersonalInfoSection({ formData }) {
  const fullName = [formData.first_name, formData.last_name].filter(Boolean).join(' ') || 'User';
  return (
    <div className="px-5 mt-9 animate-fade-up delay-200">
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary"
            style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
            badge
          </span>
        </div>
        <h3 className="font-headline font-extrabold text-[17px] text-on-surface tracking-tight leading-tight">Personal Information</h3>
      </div>

      <div className="bg-surface-container-low rounded-[22px] px-5 pt-6 pb-4 border border-outline-variant/20">
        <InfoRow label="Full Name" value={fullName} />
        <InfoRow label="Email Address" value={formData.email} />
        <InfoRow label="Phone Number" value={formData.phone} isLast />
      </div>
    </div>
  );
}

function AddressMenu({ address, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-150 hover:bg-surface-container active:bg-surface-container-high press-effect"
      >
        <span className="material-symbols-outlined text-on-surface-variant/60" style={{ fontSize: '18px' }}>
          more_vert
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-36 bg-surface-container-lowest rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-outline-variant/20 overflow-hidden z-30 animate-scale-in origin-top-right">
          <button
            onClick={() => { onEdit(address); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[13px] font-headline font-semibold text-on-surface hover:bg-surface-container transition-colors duration-150"
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '16px' }}>edit</span>
            Edit
          </button>
          <div className="h-px bg-outline-variant/20 mx-3" />
          <button
            onClick={() => { onDelete(address.id); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-[13px] font-headline font-semibold text-error hover:bg-error-container/20 transition-colors duration-150"
          >
            <span className="material-symbols-outlined text-error" style={{ fontSize: '16px' }}>delete</span>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function AddressBookSection({ addresses, onAdd, onEdit, onDelete }) {
  return (
    <div className="px-5 mt-9 animate-fade-up delay-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary"
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
          </div>
          <h3 className="font-headline font-extrabold text-[17px] text-on-surface tracking-tight">Address Book</h3>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-secondary font-headline font-bold text-[12px] uppercase tracking-wider press-effect transition-colors duration-150"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
          Add New
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className="text-center py-10">
          <span className="material-symbols-outlined text-on-surface-variant/20"
            style={{ fontSize: '52px', fontVariationSettings: "'FILL' 1" }}>
            location_off
          </span>
          <p className="text-on-surface-variant font-headline font-medium text-[14px] mt-3">No addresses saved yet</p>
          <button
            onClick={onAdd}
            className="mt-4 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-headline font-bold text-[13px] tracking-wide press-effect shadow-md shadow-primary/20"
          >
            Add Your First Address
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr, i) => (
            <div
              key={addr.id}
              className={`bg-surface-container-lowest rounded-2xl p-5 border shadow-sm transition-all duration-200 animate-fade-up ${
                addr.is_default ? 'border-primary/55 border-l-[3px]' : 'border-outline-variant/20'
              }`}
              style={{ animationDelay: `${0.35 + i * 0.07}s` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="inline-block bg-surface-container text-on-surface-variant/80 px-2.5 py-0.5 rounded-md text-[10px] font-headline font-black uppercase tracking-[0.18em] mb-2.5">
                    {addr.title || 'Address'}
                  </span>
                  <p className="text-on-surface/80 text-[13px] font-body leading-[1.65] pr-2">
                    {addr.address_line1}
                    {addr.address_line2 && `, ${addr.address_line2}`}
                    <br />
                    {addr.city}, {addr.state} &ndash; {addr.postal_code}
                  </p>
                </div>
                <AddressMenu address={addr} onEdit={onEdit} onDelete={onDelete} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionLinks({ onPasswordModal, onLogout }) {
  const items = [
    {
      icon: 'notifications',
      label: 'Notification Preferences',
      onClick: null,
      danger: false,
    },
    {
      icon: 'shield',
      label: 'Privacy & Security',
      onClick: onPasswordModal,
      danger: false,
    },
  ];

  return (
    <div className="px-5 mt-9 mb-2 animate-fade-up delay-400">
      <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/10">
        {items.map(({ icon, label, onClick }, i) => (
          <div key={label}>
            <button
              onClick={onClick}
              className="w-full flex items-center gap-4 px-5 py-4 text-left press-effect hover:bg-surface-container/60 active:bg-surface-container transition-colors duration-150"
            >
              <div className="w-9 h-9 rounded-full bg-surface-container/60 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary/75"
                  style={{ fontSize: '18px' }}>
                  {icon}
                </span>
              </div>
              <span className="flex-1 font-headline font-semibold text-[14px] leading-relaxed text-on-surface">{label}</span>
              <span className="material-symbols-outlined text-on-surface-variant/50"
                style={{ fontSize: '18px' }}>
                chevron_right
              </span>
            </button>
            {i < items.length - 1 && <div className="h-px bg-outline-variant/15 mx-5" />}
          </div>
        ))}
      </div>

      <button
        onClick={onLogout}
        className="w-full flex items-center gap-4 px-5 py-4 mt-3 text-left press-effect rounded-2xl hover:bg-error/5 transition-colors duration-150"
      >
        <div className="w-9 h-9 rounded-full bg-error/8 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-error/70"
            style={{ fontSize: '18px' }}>
            logout
          </span>
        </div>
        <span className="font-headline font-semibold text-[14px] leading-relaxed text-error/70">Sign Out</span>
      </button>
    </div>
  );
}

export default function ProfileMobileView({
  profile,
  formData,
  addresses,
  avatarUploading,
  fileInputRef,
  onAvatarUpload,
  onAddAddress,
  onEditAddress,
  onDeleteAddress,
  onPasswordModal,
  onLogout,
  getFullName,
}) {
  return (
    <div className="lg:hidden pb-32 bg-surface min-h-screen">
      <AvatarSection
        profile={profile}
        avatarUploading={avatarUploading}
        fileInputRef={fileInputRef}
        onUpload={onAvatarUpload}
        getFullName={getFullName}
      />
      <PersonalInfoSection
        formData={formData}
      />
      <AddressBookSection
        addresses={addresses}
        onAdd={onAddAddress}
        onEdit={onEditAddress}
        onDelete={onDeleteAddress}
      />
      <ActionLinks
        onPasswordModal={onPasswordModal}
        onLogout={onLogout}
      />
      <MobileBottomNav />
    </div>
  );
}
