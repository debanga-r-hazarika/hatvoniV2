import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { addressService } from '../services/addressService';
import { cartService } from '../services/cartService';
import { couponService } from '../services/couponService';
import CouponInput from '../components/CouponInput';
const DELIVERY_FEE = 79;
const FREE_DELIVERY_THRESHOLD = 500;
const COD_FEE = 30;
const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const RAZORPAY_CREATE_FUNCTION = 'create-razorpay-order-v2';
const RAZORPAY_VERIFY_FUNCTION = 'verify-razorpay-payment-v2';
const LEGACY_RAZORPAY_METHOD = 'razorpay';
const RAZORPAY_UPI_METHOD = 'razorpay_upi';
const RAZORPAY_CARDS_METHOD = 'razorpay_cards';

const initialForm = {
  firstName: '',
  lastName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postal: '',
};

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const isRazorpayPaymentMethod = (method) => [LEGACY_RAZORPAY_METHOD, RAZORPAY_UPI_METHOD, RAZORPAY_CARDS_METHOD].includes(String(method || '').toLowerCase());

export default function Checkout() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [cartItems, setCartItems] = useState(() => cartService.getCartItems());
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [form, setForm] = useState(initialForm);
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [errors, setErrors] = useState({});
  const [placingOrder, setPlacingOrder] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);

  useEffect(() => {
    const unsubscribe = cartService.subscribe(setCartItems);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
    }
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (!profile) return;
    setForm((prev) => ({
      ...prev,
      firstName: prev.firstName || profile.first_name || '',
      lastName: prev.lastName || profile.last_name || '',
      phone: prev.phone || profile.phone || '',
    }));
  }, [profile]);

  useEffect(() => {
    const loadAddresses = async () => {
      if (!user) return;
      try {
        const addresses = await addressService.getAddresses(user.id);
        setSavedAddresses(addresses);

        const defaultAddress = addresses.find((addr) => addr.is_default) || addresses[0];
        if (!defaultAddress) return;

        setSelectedAddressId(defaultAddress.id);
        setForm((prev) => ({
          ...prev,
          addressLine1: defaultAddress.address_line1 || '',
          addressLine2: defaultAddress.address_line2 || '',
          city: defaultAddress.city || '',
          state: defaultAddress.state || '',
          postal: defaultAddress.postal_code || '',
        }));
      } catch (error) {
        console.error('Error loading addresses for checkout:', error);
      }
    };

    loadAddresses();
  }, [user]);

  const totals = useMemo(() => {
    const itemCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = cartItems.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
    const deliveryFee = itemCount > 0 ? DELIVERY_FEE : 0;
    const freeShippingDiscount = subtotal >= FREE_DELIVERY_THRESHOLD && deliveryFee > 0 ? deliveryFee : 0;
    const shipping = Math.max(0, deliveryFee - freeShippingDiscount);
    const codFee = paymentMethod === 'cod' && itemCount > 0 ? COD_FEE : 0;
    const total = subtotal + shipping + codFee;

    return { itemCount, subtotal, deliveryFee, freeShippingDiscount, shipping, codFee, total };
  }, [cartItems, paymentMethod]);

  const onlyValidCartItems = cartItems.every((item) => {
    const entityId = item.entity_id || item.lot_id || item.product_id;
    return isUuid(entityId);
  });

  const totalsWithCoupon = useMemo(() => {
    const calc = couponService.calculateDiscount(
      appliedCoupon,
      totals.subtotal,
      totals.shipping,
      cartItems
    );

    const totalDiscount = Number(calc.discountAmount || 0);
    const finalTotal = Math.max(0, totals.total - totalDiscount);

    return {
      ...totals,
      totalDiscount,
      discountBreakdown: appliedCoupon?.valid
        ? [{
            code: appliedCoupon.code,
            coupon_id: appliedCoupon.coupon_id,
            type: appliedCoupon.type,
            discount: totalDiscount,
            bogo_free_units: Number(calc?.breakdown?.bogoDetails?.freeUnits || 0),
          }]
        : [],
      finalTotal,
    };
  }, [totals, appliedCoupon, cartItems]);

  const handleCouponApplied = (coupon) => {
    setAppliedCoupon(coupon);
  };

  const handleCouponRemoved = () => {
    setAppliedCoupon(null);
  };

  const handleFieldChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const handleSelectPaymentMethod = (method) => {
    setPaymentMethod(method);
    if (errors.payment_method) {
      setErrors((prev) => ({ ...prev, payment_method: '' }));
    }
  };

  const handleUseSavedAddress = (addressId) => {
    setSelectedAddressId(addressId);
    const address = savedAddresses.find((addr) => addr.id === addressId);
    if (!address) return;

    setForm((prev) => ({
      ...prev,
      addressLine1: address.address_line1 || '',
      addressLine2: address.address_line2 || '',
      city: address.city || '',
      state: address.state || '',
      postal: address.postal_code || '',
    }));
  };

  const validate = () => {
    const nextErrors = {};
    const requiredFields = [
      ['firstName', 'First name is required'],
      ['lastName', 'Last name is required'],
      ['phone', 'Phone number is required'],
      ['addressLine1', 'Address line is required'],
      ['city', 'City is required'],
      ['state', 'State is required'],
      ['postal', 'Postal code is required'],
    ];

    requiredFields.forEach(([key, message]) => {
      if (!String(form[key] || '').trim()) {
        nextErrors[key] = message;
      }
    });

    if (form.phone && !/^[0-9+\-\s]{8,16}$/.test(form.phone.trim())) {
      nextErrors.phone = 'Enter a valid phone number';
    }

    if (form.postal && !/^[0-9]{5,8}$/.test(form.postal.trim())) {
      nextErrors.postal = 'Enter a valid postal code';
    }

    if (cartItems.length === 0) {
      nextErrors.cart = 'Your cart is empty';
    }

    if (!onlyValidCartItems) {
      nextErrors.cart = 'Some items are outdated. Please re-add products or lots from catalog.';
    }

    if (!['cod', LEGACY_RAZORPAY_METHOD, RAZORPAY_UPI_METHOD, RAZORPAY_CARDS_METHOD].includes(paymentMethod)) {
      nextErrors.payment_method = 'Please select a payment method';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const ensureRazorpayScript = async () => {
    if (window.Razorpay) return;

    await new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT_URL}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Unable to load Razorpay checkout SDK.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Unable to load Razorpay checkout SDK.'));
      document.body.appendChild(script);
    });

    if (!window.Razorpay) {
      throw new Error('Razorpay checkout SDK is not available.');
    }
  };

  const createLocalOrder = async (method) => {
    const shippingAddress = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      phone: form.phone.trim(),
      address_line1: form.addressLine1.trim(),
      address_line2: form.addressLine2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      postal_code: form.postal.trim(),
      country: 'India',
      payment_method: method,
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        status: 'pending',
        total_amount: totalsWithCoupon.finalTotal,
        shipping_address: shippingAddress,
        payment_method: method,
        payment_status: method === 'cod' ? 'pending' : 'initiated',
        payment_gateway: isRazorpayPaymentMethod(method) ? 'razorpay' : null,
        billing_breakdown: {
          subtotal: totals.subtotal,
          delivery_fee: totals.deliveryFee,
          free_shipping_discount: totals.freeShippingDiscount,
          shipping_fee: totals.shipping,
          cod_fee: totals.codFee,
          discount: 0,
          coupon_code: appliedCoupon?.code || null,
          coupon_id: appliedCoupon?.coupon_id || null,
          coupon_type: appliedCoupon?.type || null,
          coupon_display_name: appliedCoupon?.display_name || null,
          coupon_discount: totalsWithCoupon.totalDiscount,
          total: totalsWithCoupon.finalTotal,
          free_shipping_threshold: FREE_DELIVERY_THRESHOLD,
          free_shipping_applied: totals.freeShippingDiscount > 0,
        },
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const orderItemsPayload = cartItems.map((item) => {
      const itemType = item.item_type || (item.product_id ? 'product' : 'lot');
      const entityId = item.entity_id || item.lot_id || item.product_id;

      if (itemType === 'product') {
        return {
          order_id: order.id,
          product_id: entityId,
          quantity: item.qty,
          price: Number(item.price || 0),
          lot_id: null,
          lot_name: null,
          lot_snapshot: null,
        };
      }

      return {
        order_id: order.id,
        lot_id: entityId,
        lot_name: item.name,
        lot_snapshot: Array.isArray(item.lot_items)
          ? item.lot_items.map((bundleItem) => ({
              product_key: bundleItem.product_key,
              product_name: bundleItem.products?.name || bundleItem.product_name || bundleItem.product_key,
              quantity: bundleItem.quantity,
              unit_price: Number(bundleItem.products?.price || bundleItem.unit_price || 0),
              unit: 'unit',
              seller_id: bundleItem.products?.seller_id || null,
            }))
          : [],
        quantity: item.qty,
        price: Number(item.price || 0),
      };
    });

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItemsPayload);

    if (itemsError) throw itemsError;

    return order;
  };

  const handlePlaceOrder = async () => {
    if (!user || placingOrder) return;
    if (!validate()) return;

    setPlacingOrder(true);
    let createdOrderId = null;

    try {
      const order = await createLocalOrder(paymentMethod);
      // Record coupon usage for single applied coupon
      if (appliedCoupon?.valid) {
        await couponService.recordCouponUsage(
          appliedCoupon.code,
          user.id,
          order.id,
          totalsWithCoupon.totalDiscount,
          totals.subtotal
        );
      }
      createdOrderId = order.id;

      if (paymentMethod === 'cod') {
        // Fire-and-forget: sync to insider in background, never block checkout
        supabase.auth.getSession().then(({ data: sessionData }) => {
          const accessToken = sessionData?.session?.access_token;
          if (accessToken) supabase.functions.setAuth(accessToken);
          return supabase.functions.invoke('forward-order-to-insider', { body: { order_id: order.id } });
        }).catch((err) => console.warn('Insider sync failed (will retry on order page):', err));

        cartService.clearCart();
        navigate(`/order/${order.id}?placed=1`);
        return;
      }

      await ensureRazorpayScript();

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error('Your session has expired. Please log in again to continue checkout.');
      }

      supabase.functions.setAuth(accessToken);

      const { data: razorpayOrder, error: razorpayOrderError } = await supabase.functions.invoke(RAZORPAY_CREATE_FUNCTION, {
        body: { order_id: order.id, payment_method: paymentMethod },
      });

      if (razorpayOrderError || !razorpayOrder?.razorpay_order_id) {
        throw new Error(razorpayOrderError?.message || razorpayOrder?.error || 'Unable to initialize Razorpay payment.');
      }

      const paymentAttempt = await new Promise((resolve) => {
        const razorpayMethodConfig = paymentMethod === RAZORPAY_UPI_METHOD
          ? {
              method: {
                upi: true,
                card: false,
                netbanking: false,
                wallet: false,
                emi: false,
                paylater: false,
              },
              upi: { flow: 'intent' },
            }
          : paymentMethod === RAZORPAY_CARDS_METHOD
            ? {
                method: {
                  upi: false,
                  card: true,
                  netbanking: true,
                  wallet: true,
                  emi: true,
                  paylater: true,
                },
              }
            : {};

        const razorpay = new window.Razorpay({
          key: razorpayOrder.key_id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency || 'INR',
          name: 'Hatvoni',
          description: `Order #${order.id.slice(0, 8)}`,
          order_id: razorpayOrder.razorpay_order_id,
          prefill: {
            name: razorpayOrder.customer?.name || `${form.firstName} ${form.lastName}`.trim(),
            email: razorpayOrder.customer?.email,
            contact: razorpayOrder.customer?.contact || form.phone,
          },
          notes: {
            local_order_id: order.id,
            checkout_payment_method: paymentMethod,
          },
          ...razorpayMethodConfig,
          handler: async (response) => {
            try {
              const { error: verifyError, data: verifyData } = await supabase.functions.invoke(RAZORPAY_VERIFY_FUNCTION, {
                body: {
                  order_id: order.id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              });

              if (verifyError || !verifyData?.ok) {
                resolve({
                  status: 'failed',
                  message: verifyError?.message || verifyData?.error || 'Payment verification failed.',
                });
                return;
              }

              resolve({
                status: 'verified',
                message: verifyData?.message || 'Payment verified.',
              });
            } catch (err) {
              resolve({
                status: 'error',
                message: err?.message || 'Payment verification failed.',
              });
            }
          },
          modal: {
            ondismiss: () => resolve({ status: 'cancelled', message: 'Payment was cancelled before completion.' }),
          },
          theme: {
            color: '#1b4332',
          },
        });

        razorpay.on('payment.failed', (event) => {
          resolve({
            status: 'failed',
            message: event?.error?.description || 'Razorpay payment failed.',
          });
        });

        razorpay.open();
      });

      if (paymentAttempt?.status === 'verified') {
        cartService.clearCart();
      }

      navigate(`/payment-processing/${order.id}?attempt=${encodeURIComponent(paymentAttempt?.status || 'processing')}`);
    } catch (error) {
      console.error('Error placing order:', error);
      if (createdOrderId && isRazorpayPaymentMethod(paymentMethod)) {
        navigate(`/payment-processing/${createdOrderId}?attempt=error`);
      } else {
        alert(error.message || 'Unable to place order right now. Please try again.');
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen grid place-items-center bg-background">
        <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background sticky top-0 z-50 py-4 md:py-6 px-6 md:px-8 flex justify-between items-center max-w-7xl mx-auto w-full border-b border-outline-variant/20">
        <Link to="/" className="font-display text-xl md:text-2xl text-primary tracking-tighter">Hatvoni</Link>
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-lg">lock</span>
          <span className="font-headline font-semibold text-xs md:text-sm tracking-tight">SECURE CHECKOUT</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 md:px-8 pb-20 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-14">
          <div className="lg:col-span-7 space-y-10 md:space-y-12">
            <section>
              <div className="flex items-center gap-3 md:gap-4 mb-8 md:mb-10">
                <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-headline font-bold text-sm">1</span>
                <h2 className="font-headline text-xl md:text-2xl font-bold tracking-tight text-primary uppercase">Delivery Details</h2>
              </div>

              {savedAddresses.length > 0 && (
                <div className="mb-6 bg-surface-container-low p-4 rounded-xl">
                  <label className="block text-xs font-bold uppercase tracking-widest text-outline mb-2">Use Saved Address</label>
                  <select
                    value={selectedAddressId}
                    onChange={(e) => handleUseSavedAddress(e.target.value)}
                    className="w-full rounded-lg border border-outline-variant bg-white px-3 py-2 text-sm"
                  >
                    {savedAddresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.title || 'Address'} - {address.city}, {address.state}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                {[['First Name', 'firstName', 'text', 'e.g. Arom'], ['Last Name', 'lastName', 'text', 'e.g. Singh']].map(([label, key, type, ph]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-outline">{label}</label>
                    <input
                      value={form[key]}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      type={type}
                      placeholder={ph}
                      className="border-0 border-b-2 border-outline-variant bg-transparent rounded-none px-0 py-2 text-on-surface placeholder:text-outline-variant/50 focus:ring-0 focus:border-primary transition-colors outline-none"
                    />
                    {errors[key] && <p className="text-error text-xs mt-1">{errors[key]}</p>}
                  </div>
                ))}

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Address Line 1</label>
                  <input
                    value={form.addressLine1}
                    onChange={(e) => handleFieldChange('addressLine1', e.target.value)}
                    type="text"
                    placeholder="Street, Colony, House No."
                    className="border-0 border-b-2 border-outline-variant bg-transparent rounded-none px-0 py-2 text-on-surface placeholder:text-outline-variant/50 focus:ring-0 focus:border-primary transition-colors outline-none"
                  />
                  {errors.addressLine1 && <p className="text-error text-xs mt-1">{errors.addressLine1}</p>}
                </div>

                <div className="md:col-span-2 flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Address Line 2 (Optional)</label>
                  <input
                    value={form.addressLine2}
                    onChange={(e) => handleFieldChange('addressLine2', e.target.value)}
                    type="text"
                    placeholder="Apartment, landmark, etc."
                    className="border-0 border-b-2 border-outline-variant bg-transparent rounded-none px-0 py-2 text-on-surface placeholder:text-outline-variant/50 focus:ring-0 focus:border-primary transition-colors outline-none"
                  />
                </div>

                {[['City / Town', 'city', 'text', 'e.g. Imphal'], ['State', 'state', 'text', 'e.g. Manipur']].map(([label, key, type, ph]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-outline">{label}</label>
                    <input
                      value={form[key]}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      type={type}
                      placeholder={ph}
                      className="border-0 border-b-2 border-outline-variant bg-transparent rounded-none px-0 py-2 text-on-surface placeholder:text-outline-variant/50 focus:ring-0 focus:border-primary transition-colors outline-none"
                    />
                    {errors[key] && <p className="text-error text-xs mt-1">{errors[key]}</p>}
                  </div>
                ))}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Postal Code</label>
                  <input
                    value={form.postal}
                    onChange={(e) => handleFieldChange('postal', e.target.value)}
                    type="text"
                    placeholder="795001"
                    className="border-0 border-b-2 border-outline-variant bg-transparent rounded-none px-0 py-2 text-on-surface placeholder:text-outline-variant/50 focus:ring-0 focus:border-primary transition-colors outline-none"
                  />
                  {errors.postal && <p className="text-error text-xs mt-1">{errors.postal}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-outline">Contact Number</label>
                  <input
                    value={form.phone}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    type="tel"
                    placeholder="+91 00000 00000"
                    className="border-0 border-b-2 border-outline-variant bg-transparent rounded-none px-0 py-2 text-on-surface placeholder:text-outline-variant/50 focus:ring-0 focus:border-primary transition-colors outline-none"
                  />
                  {errors.phone && <p className="text-error text-xs mt-1">{errors.phone}</p>}
                </div>
              </div>
            </section>

            <section className="bg-surface-container-low rounded-xl p-5 md:p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-headline font-bold text-sm">2</span>
                <h2 className="font-headline text-xl md:text-2xl font-bold tracking-tight text-primary uppercase">Payment Method</h2>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleSelectPaymentMethod('cod')}
                  className={`w-full text-left border rounded-xl p-4 transition ${paymentMethod === 'cod' ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/40 bg-white'}`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-headline font-bold text-on-surface text-base">Cash on Delivery</p>
                      <p className="text-xs text-on-surface-variant mt-1">Pay in cash when your order arrives. Includes handling fee.</p>
                    </div>
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: paymentMethod === 'cod' ? "'FILL' 1" : "'FILL' 0" }}>
                      {paymentMethod === 'cod' ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPaymentMethod(RAZORPAY_UPI_METHOD)}
                  className={`w-full text-left border rounded-xl p-4 transition ${paymentMethod === RAZORPAY_UPI_METHOD ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/40 bg-white'}`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-headline font-bold text-on-surface text-base">UPI Payment (Razorpay)</p>
                      <p className="text-xs text-on-surface-variant mt-1">Instant UPI apps and QR via Razorpay secure checkout.</p>
                    </div>
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: paymentMethod === RAZORPAY_UPI_METHOD ? "'FILL' 1" : "'FILL' 0" }}>
                      {paymentMethod === RAZORPAY_UPI_METHOD ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectPaymentMethod(RAZORPAY_CARDS_METHOD)}
                  className={`w-full text-left border rounded-xl p-4 transition ${paymentMethod === RAZORPAY_CARDS_METHOD ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/40 bg-white'}`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-headline font-bold text-on-surface text-base">Cards/Netbanking (Razorpay)</p>
                      <p className="text-xs text-on-surface-variant mt-1">Credit/debit cards, netbanking, wallets and EMI through Razorpay.</p>
                    </div>
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: paymentMethod === RAZORPAY_CARDS_METHOD ? "'FILL' 1" : "'FILL' 0" }}>
                      {paymentMethod === RAZORPAY_CARDS_METHOD ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                </button>
              </div>

              {errors.payment_method && (
                <p className="text-error text-xs mt-2">{errors.payment_method}</p>
              )}
            </section>
          </div>

          <aside className="lg:col-span-5">
            <div className="sticky top-24 space-y-6 md:space-y-8">
              <div className="bg-surface-container-low rounded-xl p-6 md:p-8">
                <h3 className="font-headline text-lg md:text-xl font-bold text-primary mb-6 md:mb-8 flex items-center gap-2">
                  <span className="material-symbols-outlined">shopping_basket</span>
                  Order Summary
                </h3>

                <div className="space-y-4 md:space-y-5 max-h-[360px] overflow-auto pr-1">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex gap-3 md:gap-4">
                      <div className="w-16 h-20 md:w-20 md:h-24 rounded-lg bg-surface-container-highest flex-shrink-0 overflow-hidden">
                        <img className="w-full h-full object-cover" src={item.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80'} alt={item.name} />
                      </div>
                      <div className="flex flex-col justify-between py-1 flex-1">
                        <div>
                          <h4 className="font-headline text-xs md:text-sm font-bold text-on-surface">{item.name}</h4>
                          <p className="text-xs text-outline mt-1">{item.category || 'Heritage Product'}</p>
                        </div>
                        <div className="flex justify-between items-end w-full">
                          <span className="text-xs font-bold text-primary bg-primary-fixed-dim/20 px-2 py-1 rounded">Qty: {item.qty}</span>
                          <span className="font-headline font-bold text-on-surface text-sm md:text-base">Rs. {(Number(item.price || 0) * item.qty).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coupon Input Component */}
                <CouponInput
                  appliedCoupon={appliedCoupon}
                  onCouponApplied={handleCouponApplied}
                  onCouponRemoved={handleCouponRemoved}
                  cartValue={totals.subtotal}
                  cartItems={cartItems}
                  userId={user?.id}
                  showAvailableCoupons={true}
                />

                <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-outline-variant/30 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-outline">Subtotal ({totalsWithCoupon.itemCount} items)</span>
                    <span className="font-medium text-on-surface">Rs. {totalsWithCoupon.subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-outline">Delivery</span>
                    <span className="font-medium text-on-surface">Rs. {totalsWithCoupon.deliveryFee.toLocaleString()}</span>
                  </div>
                  {totalsWithCoupon.subtotal > 0 && totalsWithCoupon.subtotal < FREE_DELIVERY_THRESHOLD && (
                    <div className="text-xs text-secondary font-semibold">
                      Shop for Rs. {FREE_DELIVERY_THRESHOLD.toLocaleString()} to get free shipping. Add Rs. {(FREE_DELIVERY_THRESHOLD - totalsWithCoupon.subtotal).toLocaleString()} more.
                    </div>
                  )}
                  {totalsWithCoupon.freeShippingDiscount > 0 && (
                    <div className="flex justify-between text-sm text-primary font-semibold">
                      <span>Free Shipping</span>
                      <span>-Rs. {totalsWithCoupon.freeShippingDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {paymentMethod === 'cod' && (
                    <div className="flex justify-between text-sm">
                      <span className="text-outline">COD Handling</span>
                      <span className="font-medium text-on-surface">Rs. {totalsWithCoupon.codFee}</span>
                    </div>
                  )}
                  {totalsWithCoupon.totalDiscount > 0 && (
                    <div className="flex justify-between text-sm text-green-600 dark:text-green-400 font-semibold">
                      <span>Promo Discount</span>
                      <span>-Rs. {totalsWithCoupon.totalDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {appliedCoupon?.valid && totalsWithCoupon.totalDiscount > 0 && (
                    <div className="flex justify-between text-sm text-green-700 dark:text-green-300 font-semibold">
                      <span>Coupon ({appliedCoupon.code})</span>
                      <span>-Rs. {totalsWithCoupon.totalDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  {totalsWithCoupon.discountBreakdown.some((item) => item.type === 'BOGO' && Number(item.bogo_free_units || 0) > 0) && (
                    <div className="text-xs text-primary font-semibold">
                      {totalsWithCoupon.discountBreakdown
                        .filter((item) => item.type === 'BOGO' && Number(item.bogo_free_units || 0) > 0)
                        .map((item) => `BOGO ${item.code}: You unlocked ${item.bogo_free_units} free unit${item.bogo_free_units > 1 ? 's' : ''}.`)
                        .join(' ')}
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-4 md:pt-6">
                    <span className="font-headline font-bold text-base md:text-lg text-primary uppercase tracking-tight">
                      {paymentMethod === 'cod' ? 'Amount to Collect' : 'Amount to Pay'}
                    </span>
                    <span className="font-headline font-extrabold text-xl md:text-2xl text-primary">Rs. {totalsWithCoupon.finalTotal.toLocaleString()}</span>
                  </div>
                </div>

                {(errors.cart || cartItems.length === 0) && (
                  <p className="mt-4 text-xs text-error">{errors.cart || 'Your cart is empty. Add products before checkout.'}</p>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={placingOrder || cartItems.length === 0 || (isRazorpayPaymentMethod(paymentMethod) && totalsWithCoupon.finalTotal <= 0)}
                  className="w-full mt-8 md:mt-10 bg-primary text-on-primary font-headline font-bold py-4 md:py-5 rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-lg shadow-primary/20 text-sm md:text-base disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {placingOrder
                    ? (isRazorpayPaymentMethod(paymentMethod) ? 'PROCESSING PAYMENT...' : 'PLACING ORDER...')
                    : (isRazorpayPaymentMethod(paymentMethod) ? 'PAY ONLINE WITH RAZORPAY' : 'PLACE COD ORDER')}
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>

                <p className="mt-4 text-[11px] text-outline leading-relaxed">
                  {paymentMethod === 'cod'
                    ? 'By placing this order, you agree to our terms and confirm payment by cash at delivery.'
                    : 'By proceeding, you agree to our terms and complete payment through Razorpay secure checkout.'}
                </p>
              </div>

              <div className="p-5 md:p-6 border-l-4 border-secondary-container bg-surface-container-low rounded-r-xl">
                <p className="text-xs text-on-surface leading-relaxed italic">Your purchase directly supports indigenous farming families in North East India.</p>
                <p className="text-[10px] font-headline font-bold text-secondary mt-2 tracking-widest uppercase">The Hatvoni Collective</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
