import { useEffect, useState } from 'react';

const createInitialState = (location) => ({
  warehouse_name: location?.warehouse_name || '',
  street_address: location?.street_address || '',
  pincode: location?.pincode || '',
  city: location?.city || '',
  state: location?.state || '',
  warehouse_contact_person: location?.warehouse_contact_person || '',
  warehouse_contact_number: location?.warehouse_contact_number || '',
  warehouse_email_id: location?.warehouse_email_id || '',
  is_default: location?.is_default || false,
});

export default function PickupLocationModal({ seller, location, saving, onClose, onSave }) {
  const [formData, setFormData] = useState(() => createInitialState(location));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setFormData(createInitialState(location));
    setErrors({});
  }, [location]);

  const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

  const validateForm = () => {
    const nextErrors = {};
    const pincode = normalizeDigits(formData.pincode);
    const contactNumber = normalizeDigits(formData.warehouse_contact_number);
    const email = String(formData.warehouse_email_id || '').trim();

    if (!formData.warehouse_name.trim()) nextErrors.warehouse_name = 'Warehouse name is required.';
    if (!formData.street_address.trim()) nextErrors.street_address = 'Street address is required.';
    if (!formData.pincode.trim()) nextErrors.pincode = 'Pincode is required.';
    else if (!/^[0-9]{6}$/.test(pincode)) nextErrors.pincode = 'Enter a valid 6-digit pincode.';
    if (!formData.city.trim()) nextErrors.city = 'City is required.';
    if (!formData.state.trim()) nextErrors.state = 'State is required.';
    if (!formData.warehouse_contact_person.trim()) nextErrors.warehouse_contact_person = 'Contact person is required.';
    if (!formData.warehouse_contact_number.trim()) nextErrors.warehouse_contact_number = 'Contact number is required.';
    else if (!/^[0-9]{10}$/.test(contactNumber)) nextErrors.warehouse_contact_number = 'Enter a valid 10-digit contact number.';
    if (!email) nextErrors.warehouse_email_id = 'Warehouse email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.warehouse_email_id = 'Enter a valid email address.';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validateForm()) return;
    onSave(formData);
  };

  const labelClass = 'block text-[9px] font-semibold uppercase tracking-wider text-[#3f4942]/50 mb-1.5';
  const inputClass = 'w-full h-9 px-3 text-xs font-medium rounded-lg border border-[#c8c8b9]/40 bg-white text-[#004a2b] focus:border-[#004a2b] focus:ring-2 focus:ring-[#004a2b]/10 focus:outline-none transition-all placeholder:text-[#3f4942]/30';

  const sellerLabel = seller?.first_name || seller?.last_name
    ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim()
    : seller?.email || 'Selected seller';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl border border-[#c8c8b9]/20 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[#c8c8b9]/15 bg-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#004a2b10' }}>
              <span className="material-symbols-outlined text-[#004a2b]" style={{ fontSize: '16px' }}>location_on</span>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-[#815500]">{location ? 'Edit' : 'New'} Location</p>
              <h3 className="text-base font-bold text-[#004a2b] tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{sellerLabel}</h3>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#c8c8b9]/20 text-[#3f4942]/60 hover:bg-red-50 hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className={labelClass}>Warehouse Name</label>
              <input type="text" value={formData.warehouse_name} onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_name: event.target.value }))} className={inputClass} placeholder="Warehouse name" required />
              {errors.warehouse_name && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.warehouse_name}</p>}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Street Address</label>
              <input type="text" value={formData.street_address} onChange={(event) => setFormData((prev) => ({ ...prev, street_address: event.target.value }))} className={inputClass} placeholder="Street address" required />
              {errors.street_address && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.street_address}</p>}
            </div>
            <div>
              <label className={labelClass}>Pincode</label>
              <input type="text" inputMode="numeric" maxLength={6} value={formData.pincode} onChange={(event) => setFormData((prev) => ({ ...prev, pincode: normalizeDigits(event.target.value).slice(0, 6) }))} className={inputClass} placeholder="400001" required />
              {errors.pincode && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.pincode}</p>}
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input type="text" value={formData.city} onChange={(event) => setFormData((prev) => ({ ...prev, city: event.target.value }))} className={inputClass} required />
              {errors.city && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.city}</p>}
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input type="text" value={formData.state} onChange={(event) => setFormData((prev) => ({ ...prev, state: event.target.value }))} className={inputClass} required />
              {errors.state && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.state}</p>}
            </div>
            <div>
              <label className={labelClass}>Contact Person</label>
              <input type="text" value={formData.warehouse_contact_person} onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_contact_person: event.target.value }))} className={inputClass} required />
              {errors.warehouse_contact_person && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.warehouse_contact_person}</p>}
            </div>
            <div>
              <label className={labelClass}>Contact Number</label>
              <input type="text" inputMode="numeric" maxLength={10} value={formData.warehouse_contact_number} onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_contact_number: normalizeDigits(event.target.value).slice(0, 10) }))} className={inputClass} placeholder="9876543210" required />
              {errors.warehouse_contact_number && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.warehouse_contact_number}</p>}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Email</label>
              <input type="email" value={formData.warehouse_email_id} onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_email_id: event.target.value }))} className={inputClass} placeholder="warehouse@example.com" required />
              {errors.warehouse_email_id && <p className="text-[10px] font-semibold text-red-600 mt-1">{errors.warehouse_email_id}</p>}
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-[#c8c8b9]/20 bg-[#f5f4eb]/50 cursor-pointer hover:shadow-sm transition-all">
            <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
              style={{
                borderColor: formData.is_default ? '#004a2b' : '#c8c8b960',
                backgroundColor: formData.is_default ? '#004a2b' : 'transparent',
              }}
            >
              {formData.is_default && <span className="material-symbols-outlined text-white" style={{ fontSize: '14px' }}>check</span>}
            </div>
            <input type="checkbox" checked={formData.is_default} onChange={(event) => setFormData((prev) => ({ ...prev, is_default: event.target.checked }))} className="sr-only" />
            <div>
              <p className="text-xs font-semibold text-[#004a2b]">Set as default pickup location</p>
              <p className="text-[10px] text-[#3f4942]/50 mt-0.5">This becomes the seller's default pickup location.</p>
            </div>
          </label>

          {/* Footer */}
          <div className="flex justify-end gap-2.5 pt-1">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs font-semibold text-[#3f4942] bg-[#f5f4eb] hover:bg-[#f5f4eb]/80 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="h-9 px-5 rounded-lg bg-[#004a2b] text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5">
              {saving ? (
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
              )}
              {saving ? 'Saving...' : location ? 'Save Changes' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
