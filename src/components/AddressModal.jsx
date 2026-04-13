import { useState, useEffect } from 'react';

export default function AddressModal({ isOpen, onClose, onSave, address = null }) {
  const [formData, setFormData] = useState({
    title: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India',
    is_default: false
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (address) {
      setFormData(address);
    } else {
      setFormData({
        title: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'India',
        is_default: false
      });
    }
    setErrors({});
  }, [address, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.address_line1.trim()) newErrors.address_line1 = 'Address line 1 is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.state.trim()) newErrors.state = 'State is required';
    if (!formData.postal_code.trim()) newErrors.postal_code = 'Postal code is required';
    if (!formData.country.trim()) newErrors.country = 'Country is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSave(formData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-primary text-on-primary p-6 md:p-8 rounded-t-2xl flex justify-between items-center border-b border-primary-container">
          <h2 className="font-headline text-2xl md:text-3xl font-extrabold tracking-tight">
            {address ? 'Edit Address' : 'Add New Address'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-primary-container/20 rounded-full transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
              Address Title
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g., Home, Office"
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
            />
            {errors.title && <p className="text-error text-sm mt-1">{errors.title}</p>}
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
              Address Line 1
            </label>
            <input
              type="text"
              name="address_line1"
              value={formData.address_line1}
              onChange={handleChange}
              placeholder="Street address, P.O. box"
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
            />
            {errors.address_line1 && <p className="text-error text-sm mt-1">{errors.address_line1}</p>}
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
              Address Line 2 (Optional)
            </label>
            <input
              type="text"
              name="address_line2"
              value={formData.address_line2}
              onChange={handleChange}
              placeholder="Apartment, suite, unit, building, floor, etc."
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="City"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
              />
              {errors.city && <p className="text-error text-sm mt-1">{errors.city}</p>}
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
                State/Province
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="State/Province"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
              />
              {errors.state && <p className="text-error text-sm mt-1">{errors.state}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
                Postal Code
              </label>
              <input
                type="text"
                name="postal_code"
                value={formData.postal_code}
                onChange={handleChange}
                placeholder="Postal Code"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
              />
              {errors.postal_code && <p className="text-error text-sm mt-1">{errors.postal_code}</p>}
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-2">
                Country
              </label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                placeholder="Country"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-on-surface font-headline focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
              />
              {errors.country && <p className="text-error text-sm mt-1">{errors.country}</p>}
            </div>
          </div>

          <div className="flex items-center space-x-3 p-4 bg-surface-container-low rounded-lg">
            <input
              type="checkbox"
              id="is_default"
              name="is_default"
              checked={formData.is_default}
              onChange={handleChange}
              className="w-5 h-5 text-secondary border-outline-variant rounded focus:ring-2 focus:ring-secondary"
            />
            <label htmlFor="is_default" className="font-headline font-semibold text-on-surface cursor-pointer">
              Set as default shipping address
            </label>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-lg font-headline font-bold text-on-surface bg-surface-container-low hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 rounded-lg font-headline font-bold text-white bg-secondary hover:bg-secondary/90 transition-colors shadow-lg"
            >
              {address ? 'Update Address' : 'Add Address'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
