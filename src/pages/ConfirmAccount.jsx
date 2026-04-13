import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ConfirmAccount() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  const needsConfirmation = location.state?.needsConfirmation;
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    if (!email) {
      navigate('/signup');
    }
  }, [email, navigate]);

  const handleResendEmail = async () => {
    setResendLoading(true);
    setResendError('');
    setResendSuccess(false);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    });

    if (error) {
      setResendError(error.message);
    } else {
      setResendSuccess(true);
    }
    setResendLoading(false);
  };

  if (needsConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 sm:p-10">
            <div className="text-center">
              <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>

              <h2 className="text-3xl font-bold text-slate-900 mb-3">Check your email</h2>
              <p className="text-slate-600 mb-6">
                Please check your email to activate your account
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-left">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-2">We sent an email to:</p>
                    {email && (
                      <p className="text-sm font-semibold text-slate-900 mb-3">
                        {email}
                      </p>
                    )}
                    <p className="text-sm text-slate-600 mb-2">
                      Click the verification link in the email to activate your account. Once verified, you'll be automatically logged in.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                <p className="text-xs font-medium text-slate-700 mb-2">Can't find the email?</p>
                <ul className="text-xs text-slate-600 space-y-1 text-left list-disc list-inside">
                  <li>Check your spam or junk folder</li>
                  <li>Make sure you entered the correct email address</li>
                  <li>Wait a few minutes and check again</li>
                  <li>Click the button below to resend the email</li>
                </ul>
              </div>

              {resendSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600">Confirmation email resent successfully!</p>
                </div>
              )}

              {resendError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{resendError}</p>
                </div>
              )}

              <button
                onClick={handleResendEmail}
                disabled={resendLoading || resendSuccess}
                className="w-full py-3 px-4 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              >
                {resendLoading ? 'Sending...' : resendSuccess ? 'Email sent!' : 'Resend confirmation email'}
              </button>

              <Link
                to="/login"
                className="block w-full py-2 text-slate-600 text-center text-sm hover:text-slate-900 transition-colors duration-200"
              >
                Back to sign in
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Need help? Contact us at{' '}
            <a href="mailto:hello@hatvoni.com" className="font-medium text-slate-700 hover:text-slate-900 underline">
              hello@hatvoni.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 sm:p-10">
          <div className="text-center">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-3xl font-bold text-slate-900 mb-3">Welcome to Hatvoni!</h2>
            <p className="text-slate-600 mb-8">
              Your account has been successfully created and verified
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-8 text-left">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-slate-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-1">Your account is ready to use</p>
                  <p className="text-sm text-slate-600">
                    You can now access your profile and start shopping for authentic heritage products.
                  </p>
                  {email && (
                    <p className="text-sm text-slate-500 mt-2">
                      Account email: <span className="font-medium text-slate-700">{email}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                to="/profile"
                className="block w-full py-3 px-4 bg-slate-900 text-white text-center rounded-lg font-medium hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-200"
              >
                Go to My Profile
              </Link>
              <Link
                to="/products"
                className="block w-full py-3 px-4 bg-white border-2 border-slate-300 text-slate-700 text-center rounded-lg font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-200"
              >
                Start Shopping
              </Link>
              <Link
                to="/"
                className="block w-full py-2 text-slate-600 text-center text-sm hover:text-slate-900 transition-colors duration-200"
              >
                Go to Homepage
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Questions? Contact us at{' '}
          <a href="mailto:hello@hatvoni.com" className="font-medium text-slate-700 hover:text-slate-900 underline">
            hello@hatvoni.com
          </a>
        </p>
      </div>
    </div>
  );
}
