import { useEffect, useRef, useState } from 'react';

const EMPTY_FORM = {
  warehouse_name: '',
  velocity_warehouse_id: '',
  street_address: '',
  pincode: '',
  city: '',
  state: '',
  contact_person: '',
  contact_number: '',
  email: '',
};

const createInitialState = (warehouse) => ({
  warehouse_name: warehouse?.warehouse_name || '',
  velocity_warehouse_id: warehouse?.velocity_warehouse_id || '',
  street_address: warehouse?.street_address || '',
  pincode: warehouse?.pincode || '',
  city: warehouse?.city || '',
  state: warehouse?.state || '',
  contact_person: warehouse?.contact_person || '',
  contact_number: warehouse?.contact_number || '',
  email: warehouse?.email || '',
});

export default function WarehouseModal({ warehouse, saving, onClose, onSave }) {
  const [formData, setFormData] = useState(() => createInitialState(warehouse));
  const [errors, setErrors] = useState({});
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const pincodeTimerRef = useRef(null);

  useEffect(() => {
    setFormData(createInitialState(warehouse));
    setErrors({});
  }, [warehouse]);

  // Auto-detect city & state from pincode using India Post API
  const lookupPincode = async (pincode) => {
    if (!/^[0-9]{6}$/.test(pincode)) return;
    setPincodeLoading(true);
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const json = await res.json();
      const postOffice = json?.[0]?.PostOffice?.[0];
      if (postOffice) {
        setFormData((prev) => ({
          ...prev,
          city: postOffice.District || postOffice.Name || prev.city,
          state: postOffice.State || prev.state,
        }));
        setErrors((prev) => {
          const next = { ...prev };
          delete next.city;
          delete next.state;
          return next;
        });
      }
    } catch {
      // silently ignore — user can fill manually
    } finally {
      setPincodeLoading(false);
    }
  };

  const handlePincodeChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setFormData((prev) => ({ ...prev, pincode: digits }));
    clearTimeout(pincodeTimerRef.current);
    if (digits.length === 6) {
      pincodeTimerRef.current = setTimeout(() => lookupPincode(digits), 400);
    }
  };

  const normalizeDigits = (value) => String(value || '').replace(/\D/g, '');

  const validateForm = () => {
    const nextErrors = {};
    const pincode = normalizeDigits(formData.pincode);
    const contactNumber = normalizeDigits(formData.contact_number);

    if (!formData.warehouse_name.trim()) nextErrors.warehouse_name = 'Warehouse name is required.';
    if (!formData.street_address.trim()) nextErrors.street_address = 'Street address is required.';
    if (!formData.pincode.trim()) nextErrors.pincode = 'Pincode is required.';
    else if (!/^[0-9]{6}$/.test(pincode)) nextErrors.pincode = 'Enter a valid 6-digit pincode.';
    if (!formData.city.trim()) nextErrors.city = 'City is required.';
    if (!formData.state.trim()) nextErrors.state = 'State is required.';
    if (!formData.contact_person.trim()) nextErrors.contact_person = 'Contact person is required.';
    if (!formData.contact_number.trim()) nextErrors.contact_number = 'Contact number is required.';
    else if (!/^[0-9]{10}$/.test(contactNumber)) nextErrors.contact_number = 'Enter a valid 10-digit contact number.';
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validateForm()) return;
    onSave({
      ...formData,
      pincode: normalizeDigits(formData.pincode),
      contact_number: normalizeDigits(formData.contact_number),
    });
  };

  const labelClass = 'block text-[9px] font-semibold uppercase tracking-wider text-[#3f4942]/50 mb-1.5';
  const inputClass = 'w-full h-9 px-3 text-xs font-medium rounded-lg border border-[#c8c8b9]/40 bg-white text-[#004a2b] focus:border-[#004a2b] focus:ring-2 focus:ring-[#004a2b]/10 focus:outline-none transition-all placeholder:text-[#3f4942]/30';
  const errorClass = 'text-[10px] font-semibold text-red-600 mt-1';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[#c8c8b9]/20 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[#c8c8b9]/15 bg-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#004a2b]/10">
              <span className="material-symbols-outlined text-[#004a2b]" style={{ fontSize: '16px' }}>warehouse</span>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-[#815500]">
                {warehouse ? 'Edit' : 'New'} Warehouse
              </p>
              <h3
                className="text-base font-bold text-[#004a2b] tracking-tight"
                style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}
              >
                {warehouse ? warehouse.warehouse_name : 'Add Warehouse'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#c8c8b9]/20 text-[#3f4942]/60 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            {/* Warehouse Name */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                Warehouse Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.warehouse_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, warehouse_name: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Mumbai Central Warehouse"
              />
              {errors.warehouse_name && <p className={errorClass}>{errors.warehouse_name}</p>}
            </div>

            {/* Velocity Warehouse ID */}
            <div className="md:col-span-2">
              <label className={labelClass}>Velocity Warehouse ID</label>
              <input
                type="text"
                value={formData.velocity_warehouse_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, velocity_warehouse_id: e.target.value }))}
                className={inputClass}
                placeholder="Enter manually if available"
              />
              <p className="text-[9px] text-[#3f4942]/40 mt-1">Optional. Fill this in manually from your Velocity dashboard.</p>
            </div>

            {/* Street Address */}
            <div className="md:col-span-2">
              <label className={labelClass}>
                Street Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.street_address}
                onChange={(e) => setFormData((prev) => ({ ...prev, street_address: e.target.value }))}
                className={inputClass}
                placeholder="Building, street, area"
              />
              {errors.street_address && <p className={errorClass}>{errors.street_address}</p>}
            </div>

            {/* Pincode */}
            <div>
              <label className={labelClass}>
                Pincode <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={formData.pincode}
                  onChange={(e) => handlePincodeChange(e.target.value)}
                  className={inputClass}
                  placeholder="400001"
                />
                {pincodeLoading && (
                  <span
                    className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-[#004a2b]/40"
                    style={{ fontSize: '14px' }}
                  >
                    progress_activity
                  </span>
                )}
              </div>
              {errors.pincode && <p className={errorClass}>{errors.pincode}</p>}
            </div>

            {/* City — auto-detected */}
            <div>
              <label className={labelClass}>
                City <span className="text-red-500">*</span>
                {pincodeLoading && (
                  <span className="ml-1 text-[8px] text-[#815500] normal-case tracking-normal">detecting…</span>
                )}
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                className={inputClass}
                placeholder="Auto-detected from pincode"
              />
              {errors.city && <p className={errorClass}>{errors.city}</p>}
            </div>

            {/* State — auto-detected */}
            <div>
              <label className={labelClass}>
                State <span className="text-red-500">*</span>
                {pincodeLoading && (
                  <span className="ml-1 text-[8px] text-[#815500] normal-case tracking-normal">detecting…</span>
                )}
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData((prev) => ({ ...prev, state: e.target.value }))}
                className={inputClass}
                placeholder="Auto-detected from pincode"
              />
              {errors.state && <p className={errorClass}>{errors.state}</p>}
            </div>

            {/* Contact Person */}
            <div>
              <label className={labelClass}>
                Contact Person <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.contact_person}
                onChange={(e) => setFormData((prev) => ({ ...prev, contact_person: e.target.value }))}
                className={inputClass}
                placeholder="Full name"
              />
              {errors.contact_person && <p className={errorClass}>{errors.contact_person}</p>}
            </div>

            {/* Contact Number */}
            <div>
              <label className={labelClass}>
                Contact Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={formData.contact_number}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    contact_number: normalizeDigits(e.target.value).slice(0, 10),
                  }))
                }
                className={inputClass}
                placeholder="9876543210"
              />
              {errors.contact_number && <p className={errorClass}>{errors.contact_number}</p>}
            </div>

            {/* Email */}
            <div className="md:col-span-2">
              <label className={labelClass}>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                className={inputClass}
                placeholder="warehouse@example.com (optional)"
              />
              {errors.email && <p className={errorClass}>{errors.email}</p>}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-xs font-semibold text-[#3f4942] bg-[#f5f4eb] hover:bg-[#f5f4eb]/80 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 px-5 rounded-lg bg-[#004a2b] text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? (
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
              )}
              {saving ? 'Saving…' : warehouse ? 'Save Changes' : 'Add Warehouse'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
