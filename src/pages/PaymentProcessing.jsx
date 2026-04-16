import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const POLL_INTERVAL_MS = 3500;
const MAX_WAIT_MS = 120000;
const RETRY_COOLDOWN_MS = 5000;
const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const RAZORPAY_CREATE_FUNCTION = 'create-razorpay-order-v2';
const RAZORPAY_VERIFY_FUNCTION = 'verify-razorpay-payment-v2';

const isRazorpayMethod = (method) => String(method || '').toLowerCase().startsWith('razorpay');

export default function PaymentProcessing() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [order, setOrder] = useState(null);
  const [viewState, setViewState] = useState('processing');
  const [statusText, setStatusText] = useState('Waiting for Razorpay confirmation...');
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);
  const [retryCooldownLeft, setRetryCooldownLeft] = useState(0);

  const startedAtRef = useRef(Date.now());
  const redirectTimerRef = useRef(null);
  const retryCooldownTimerRef = useRef(null);

  const attempt = String(searchParams.get('attempt') || '').toLowerCase();

  const fetchOrderStatus = useCallback(async () => {
    if (!id) return;

    const { data, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, payment_status, payment_method, payment_gateway, total_amount, created_at, paid_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!data) throw new Error('Order not found.');

    setOrder(data);

    const paymentStatus = String(data.payment_status || 'pending').toLowerCase();
    const paymentMethod = String(data.payment_method || '').toLowerCase();

    if (!isRazorpayMethod(paymentMethod)) {
      navigate(`/order/${id}?placed=1`);
      return;
    }

    if (paymentStatus === 'paid') {
      setViewState('success');
      setStatusText('Payment cleared. Redirecting to your order details...');
      if (!redirectTimerRef.current) {
        redirectTimerRef.current = setTimeout(() => {
          navigate(`/order/${id}?placed=1&payment=online`);
        }, 1400);
      }
      return;
    }

    if (paymentStatus === 'failed' || paymentStatus === 'refunded') {
      setViewState('failed');
      setStatusText('Payment was not completed.');
      return;
    }

    const waitedMs = Date.now() - startedAtRef.current;
    // cancelled/failed are definitive — show failed immediately
    // error means verify call failed but payment may have gone through — poll for up to 30s before giving up
    const isDefinitiveFailure = attempt === 'cancelled' || attempt === 'failed';
    const isErrorWithTimeout = attempt === 'error' && waitedMs >= 30000;
    if (waitedMs >= MAX_WAIT_MS || isDefinitiveFailure || isErrorWithTimeout) {
      setViewState('failed');
      setStatusText('We could not confirm your payment.');
      return;
    }

    setViewState('processing');
    setStatusText(attempt === 'error' ? 'Verification had an issue — checking if payment went through...' : 'We are still checking Razorpay confirmation...');
  }, [attempt, id, navigate]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }

    let intervalId;

    const run = async () => {
      try {
        setError('');
        await fetchOrderStatus();
      } catch (err) {
        console.error('Payment processing status fetch failed:', err);
        setError(err.message || 'Unable to check payment status right now.');
      }
    };

    run();
    intervalId = setInterval(run, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
      if (retryCooldownTimerRef.current) {
        clearInterval(retryCooldownTimerRef.current);
      }
    };
  }, [authLoading, fetchOrderStatus, navigate, user]);

  const startRetryCooldown = useCallback(() => {
    if (retryCooldownTimerRef.current) {
      clearInterval(retryCooldownTimerRef.current);
    }

    const startAt = Date.now();
    setRetryCooldownLeft(Math.ceil(RETRY_COOLDOWN_MS / 1000));

    retryCooldownTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startAt;
      const remainingMs = Math.max(RETRY_COOLDOWN_MS - elapsed, 0);
      const remainingSec = Math.ceil(remainingMs / 1000);
      setRetryCooldownLeft(remainingSec);

      if (remainingMs <= 0) {
        clearInterval(retryCooldownTimerRef.current);
        retryCooldownTimerRef.current = null;
      }
    }, 250);
  }, []);

  const heading = useMemo(() => {
    if (viewState === 'success') return 'Order Placed';
    if (viewState === 'failed') return 'Order Not Placed';
    return 'Processing Payment';
  }, [viewState]);

  const icon = useMemo(() => {
    if (viewState === 'success') return 'check_circle';
    if (viewState === 'failed') return 'error';
    return 'progress_activity';
  }, [viewState]);

  const iconClass = useMemo(() => {
    if (viewState === 'success') return 'text-primary';
    if (viewState === 'failed') return 'text-error';
    return 'text-secondary animate-spin';
  }, [viewState]);

  const ensureRazorpayScript = useCallback(async () => {
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
  }, []);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setError('');
      await fetchOrderStatus();
    } catch (err) {
      setError(err.message || 'Unable to refresh status right now.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!order || isRetryingPayment || retryCooldownLeft > 0) return;

    try {
      setIsRetryingPayment(true);
      setError('');
      setViewState('processing');
      setStatusText('Opening Razorpay checkout...');

      await ensureRazorpayScript();

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error('Your session has expired. Please log in again.');
      }

      supabase.functions.setAuth(accessToken);

      const { data: razorpayOrder, error: razorpayOrderError } = await supabase.functions.invoke(RAZORPAY_CREATE_FUNCTION, {
        body: { order_id: order.id, payment_method: order.payment_method },
      });

      if (razorpayOrderError || !razorpayOrder?.razorpay_order_id) {
        throw new Error(razorpayOrderError?.message || razorpayOrder?.error || 'Unable to initialize Razorpay payment.');
      }

      const retryStatus = await new Promise((resolve) => {
        const razorpay = new window.Razorpay({
          key: razorpayOrder.key_id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency || 'INR',
          name: 'Hatvoni',
          description: `Order #${order.id.slice(0, 8)}`,
          order_id: razorpayOrder.razorpay_order_id,
          prefill: {
            name: razorpayOrder.customer?.name,
            email: razorpayOrder.customer?.email,
            contact: razorpayOrder.customer?.contact,
          },
          notes: {
            local_order_id: order.id,
            retry_from_processing_page: true,
          },
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
                resolve({ status: 'failed', message: verifyError?.message || verifyData?.error || 'Payment verification failed.' });
                return;
              }

              resolve({ status: 'verified' });
            } catch (err) {
              resolve({ status: 'error', message: err?.message || 'Payment verification failed.' });
            }
          },
          modal: {
            ondismiss: () => resolve({ status: 'cancelled', message: 'Payment window was closed.' }),
          },
          theme: {
            color: '#1b4332',
          },
        });

        razorpay.on('payment.failed', (event) => {
          resolve({ status: 'failed', message: event?.error?.description || 'Razorpay payment failed.' });
        });

        razorpay.open();
      });

      if (retryStatus?.status === 'verified') {
        setStatusText('Payment cleared. Redirecting to your order details...');
        await fetchOrderStatus();
      } else {
        setViewState('failed');
        setStatusText(retryStatus?.message || 'Payment was not completed.');
      }
    } catch (err) {
      console.error('Retry payment failed:', err);
      setViewState('failed');
      setError(err.message || 'Unable to retry payment right now.');
    } finally {
      setIsRetryingPayment(false);
      startRetryCooldown();
    }
  };

  return (
    <main className="min-h-screen bg-background px-6 py-10 md:py-16">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="font-brand text-xl md:text-2xl text-primary tracking-tighter">Hatvoni</Link>
          <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-outline">Secure Payment Check</span>
        </header>

        <section className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-6 md:p-10 text-center">
          <span className={`material-symbols-outlined text-6xl md:text-7xl ${iconClass}`}>{icon}</span>
          <h1 className="mt-5 font-headline text-3xl md:text-4xl font-bold text-primary uppercase tracking-tight">{heading}</h1>
          <p className="mt-3 text-sm md:text-base text-on-surface-variant">{statusText}</p>

          {error && (
            <p className="mt-4 text-xs md:text-sm text-error">{error}</p>
          )}

          {viewState === 'processing' && (
            <div className="mt-8 space-y-3">
              <p className="text-xs md:text-sm text-on-surface-variant">Please keep this page open while we confirm with Razorpay.</p>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-outline-variant text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
              >
                <span className={`material-symbols-outlined text-base ${isRefreshing ? 'animate-spin' : ''}`}>refresh</span>
                Recheck Status
              </button>
            </div>
          )}

          {viewState === 'failed' && (
            <div className="mt-8 text-left bg-error-container/20 border border-error/20 rounded-xl p-4 md:p-5">
              <p className="font-bold text-error text-sm md:text-base">Payment not completed.</p>
              <p className="mt-2 text-xs md:text-sm text-on-surface-variant leading-relaxed">
                If money was deducted from your account but this page still shows payment incomplete, please contact us with your order reference so we can assist you immediately.
              </p>
              <p className="mt-3 text-xs md:text-sm font-semibold text-primary">Order Ref: #{String(id || '').slice(0, 8)}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/contact" className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs md:text-sm font-bold uppercase tracking-wide">Contact Support</Link>
                <button
                  type="button"
                  onClick={handleRetryPayment}
                  disabled={isRetryingPayment || retryCooldownLeft > 0}
                  className="px-4 py-2 rounded-lg bg-secondary text-white text-xs md:text-sm font-bold uppercase tracking-wide disabled:opacity-60"
                >
                  {isRetryingPayment ? 'Retrying...' : retryCooldownLeft > 0 ? `Retry in ${retryCooldownLeft}s` : 'Retry Payment'}
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="px-4 py-2 rounded-lg border border-outline-variant text-xs md:text-sm font-bold uppercase tracking-wide text-primary disabled:opacity-60"
                >
                  Check Again
                </button>
                <Link to={`/order/${id}?payment=pending`} className="px-4 py-2 rounded-lg border border-outline-variant text-xs md:text-sm font-bold uppercase tracking-wide text-primary">View Order</Link>
              </div>
            </div>
          )}

          {viewState === 'success' && (
            <p className="mt-7 text-xs md:text-sm text-on-surface-variant">Taking you to your order details now...</p>
          )}
        </section>

        {order && (
          <p className="mt-4 text-center text-[11px] md:text-xs text-outline">
            Order #{String(order.id).slice(0, 8)} • Payment Status: {String(order.payment_status || 'pending').toUpperCase()}
          </p>
        )}
      </div>
    </main>
  );
}
