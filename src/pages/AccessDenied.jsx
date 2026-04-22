import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AccessDenied() {
  const { isAdmin, isEmployee } = useAuth();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-[#fbfaf1] flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-4xl text-red-400">lock</span>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-widest text-red-400 mb-2">
          Access Denied
        </p>
        <h1 className="text-2xl font-bold text-[#004a2b] mb-3"
            style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          You don't have permission
        </h1>
        <p className="text-sm text-[#3f4942] mb-8">
          {isEmployee && !isAdmin
            ? "This module hasn't been assigned to your account. Contact your administrator to request access."
            : 'You need to be logged in with the right permissions to view this page.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {(isAdmin || isEmployee) && (
            <Link
              to="/admin"
              className="inline-flex items-center justify-center gap-2 h-10 px-5 bg-[#004a2b] text-white text-sm font-semibold rounded-full hover:bg-[#004a2b]/90 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-base">dashboard</span>
              {isAdmin ? 'Admin Dashboard' : 'Staff Dashboard'}
            </Link>
          )}
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 h-10 px-5 border border-[#bec9bf]/40 text-[#004a2b] text-sm font-semibold rounded-full hover:bg-[#004a2b]/[0.05] transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-base">home</span>
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
