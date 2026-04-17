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

  const labelClass = 'block text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2';
  const inputClass = 'w-full px-5 py-3.5 border border-outline-variant/30 rounded-2xl bg-surface-container-lowest focus:border-primary focus:bg-primary/5 focus:ring-4 focus:ring-primary/5 focus:outline-none transition-all font-body text-primary font-bold placeholder:font-normal placeholder:opacity-40';

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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-[2.5rem] border border-outline-variant/30 bg-surface-container-lowest shadow-[0_28px_100px_rgba(0,0,0,0.45)]" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-outline-variant/10 bg-surface-container-lowest/95 backdrop-blur-sm px-8 py-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary mb-1">Pickup Location</p>
            <h3 className="font-brand text-3xl font-bold text-primary tracking-tight">
              {location ? 'Edit Location' : 'Add Location'}
            </h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              {seller?.first_name || seller?.last_name
                ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim()
                : seller?.email || 'Selected seller'}
            </p>
          </div>
          <button onClick={onClose} className="w-11 h-11 rounded-full border border-outline-variant/20 bg-surface-container-low hover:bg-surface-container transition-all flex items-center justify-center text-on-surface-variant hover:text-red-500">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2 md:col-span-2">
              <label className={labelClass}>Warehouse Name</label>
              <input
                type="text"
                value={formData.warehouse_name}
                onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_name: event.target.value }))}
                className={inputClass}
                placeholder="Warehouse name"
                required
              />
              {errors.warehouse_name && <p className="text-xs font-semibold text-red-600">{errors.warehouse_name}</p>}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className={labelClass}>Street Address</label>
              <input
                type="text"
                value={formData.street_address}
                onChange={(event) => setFormData((prev) => ({ ...prev, street_address: event.target.value }))}
                className={inputClass}
                placeholder="Street address"
                required
              />
              {errors.street_address && <p className="text-xs font-semibold text-red-600">{errors.street_address}</p>}
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Pincode</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={formData.pincode}
                onChange={(event) => setFormData((prev) => ({ ...prev, pincode: normalizeDigits(event.target.value).slice(0, 6) }))}
                className={inputClass}
                placeholder="400001"
                required
              />
              {errors.pincode && <p className="text-xs font-semibold text-red-600">{errors.pincode}</p>}
            </div>
            <div className="space-y-2">
              <label className={labelClass}>City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(event) => setFormData((prev) => ({ ...prev, city: event.target.value }))}
                className={inputClass}
                required
              />
              {errors.city && <p className="text-xs font-semibold text-red-600">{errors.city}</p>}
            </div>
            <div className="space-y-2">
              <label className={labelClass}>State</label>
              <input
                type="text"
                value={formData.state}
                onChange={(event) => setFormData((prev) => ({ ...prev, state: event.target.value }))}
                className={inputClass}
                required
              />
              {errors.state && <p className="text-xs font-semibold text-red-600">{errors.state}</p>}
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Warehouse Contact Person</label>
              <input
                type="text"
                value={formData.warehouse_contact_person}
                onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_contact_person: event.target.value }))}
                className={inputClass}
                required
              />
              {errors.warehouse_contact_person && <p className="text-xs font-semibold text-red-600">{errors.warehouse_contact_person}</p>}
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Warehouse Contact Number</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={formData.warehouse_contact_number}
                onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_contact_number: normalizeDigits(event.target.value).slice(0, 10) }))}
                className={inputClass}
                placeholder="9876543210"
                required
              />
              {errors.warehouse_contact_number && <p className="text-xs font-semibold text-red-600">{errors.warehouse_contact_number}</p>}
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className={labelClass}>Warehouse Email Id</label>
              <input
                type="email"
                value={formData.warehouse_email_id}
                onChange={(event) => setFormData((prev) => ({ ...prev, warehouse_email_id: event.target.value }))}
                className={inputClass}
                placeholder="warehouse@example.com"
                required
              />
              {errors.warehouse_email_id && <p className="text-xs font-semibold text-red-600">{errors.warehouse_email_id}</p>}
            </div>
          </div>

          <label className="flex items-start gap-3 p-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low/40 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_default}
              onChange={(event) => setFormData((prev) => ({ ...prev, is_default: event.target.checked }))}
              className="mt-1 w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <div>
              <p className="font-bold text-primary">Set as default pickup location</p>
              <p className="text-sm text-on-surface-variant mt-1">
                This becomes the seller’s default pickup location in the admin workflow.
              </p>
            </div>
          </label>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-2xl border border-outline-variant/20 text-on-surface-variant font-semibold hover:bg-surface-container-low transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-3 rounded-2xl bg-primary text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving ? 'Saving...' : location ? 'Save Changes' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
