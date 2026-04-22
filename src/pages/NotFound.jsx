import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-[#fbfaf1] flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        {/* Big 404 */}
        <p className="text-[8rem] font-black leading-none text-[#004a2b]/10 select-none"
           style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          404
        </p>

        <div className="-mt-4 mb-8">
          <h1 className="text-2xl font-bold text-[#004a2b] mb-2"
              style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Page not found
          </h1>
          <p className="text-sm text-[#3f4942]">
            <span className="font-mono text-xs bg-[#004a2b]/[0.07] text-[#004a2b] px-2 py-0.5 rounded">
              {pathname}
            </span>
            {' '}doesn't exist.
          </p>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 h-10 px-6 bg-[#004a2b] text-white text-sm font-semibold rounded-full hover:bg-[#004a2b]/90 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
