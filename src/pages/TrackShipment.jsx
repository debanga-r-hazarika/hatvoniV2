import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  VELOCITY_TRACKING_BASE,
  isLikelyTrackingId,
  velocityTrackingPageUrl,
} from '../lib/velocityTracking';

export default function TrackShipment() {
  const { trackingId: rawParam } = useParams();
  const trackingId = useMemo(() => decodeURIComponent(String(rawParam || '').trim()), [rawParam]);

  const [iframeLoaded, setIframeLoaded] = useState(false);
  const valid = isLikelyTrackingId(trackingId);
  const embedUrl = valid ? velocityTrackingPageUrl(trackingId) : '';

  useEffect(() => {
    const prev = document.title;
    document.title = valid
      ? `Track shipment · ${trackingId}`
      : 'Track shipment';
    return () => { document.title = prev; };
  }, [valid, trackingId]);

  if (!valid) {
    return (
      <main className="pt-28 pb-16 md:pt-36 md:pb-20 min-h-screen bg-gradient-to-b from-background via-surface to-surface-container-low/80">
        <div className="max-w-lg mx-auto px-4 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-error-container/30 text-error mb-4">
            <span className="material-symbols-outlined text-3xl">gpp_maybe</span>
          </div>
          <h1 className="font-headline text-xl font-bold text-gray-900">Invalid tracking link</h1>
          <p className="text-sm text-gray-500 font-body mt-2">
            Check the tracking number in your order confirmation email or order page, then try again.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/orders"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-on-primary font-headline hover:opacity-95 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              My orders
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-outline-variant/40 bg-surface px-5 py-3 text-sm font-bold text-gray-900 font-headline hover:bg-surface-container-low transition-colors"
            >
              Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-24 pb-12 min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-2">Shipment tracking</p>
            <h1 className="font-headline text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
              Track your delivery
            </h1>
            <p className="text-sm text-gray-500 font-body mt-2 max-w-xl">
              Live status, address, and order details provided by our shipping partner Velocity. AWB{' '}
              <span className="font-mono font-semibold text-gray-900">{trackingId}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/35 bg-white px-4 py-2 text-xs font-bold text-gray-900 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              Open in new tab
            </a>
            <Link
              to="/orders"
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Orders
            </Link>
          </div>
        </header>

        {/* Embed card */}
        <div className="rounded-2xl border border-outline-variant/25 bg-white shadow-[0_20px_60px_rgba(0,74,43,0.07)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-outline-variant/15 bg-surface-container-low/50">
            <div className="flex items-center gap-2 text-[11px] text-gray-500 font-body">
              <span className="material-symbols-outlined text-gray-500 text-[18px]">map</span>
              Carrier tracking ·{' '}
              <span className="font-mono text-on-surface font-semibold">{trackingId}</span>
            </div>
            <p className="text-[10px] text-gray-500/70 max-w-md text-right">
              If the frame stays blank, use <strong>Open in new tab</strong> — some browsers block embedding external carrier pages.
            </p>
          </div>

          <div className="relative bg-surface-container-low/40 min-h-[62vh] md:min-h-[68vh]">
            {!iframeLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-surface-container-low/60 backdrop-blur-[2px]">
                <span className="material-symbols-outlined text-4xl text-gray-500 animate-spin">progress_activity</span>
                <p className="text-xs font-semibold text-gray-500 font-body">Loading tracking…</p>
              </div>
            )}
            <iframe
              title={`Velocity tracking ${trackingId}`}
              src={embedUrl}
              className="w-full min-h-[62vh] md:min-h-[68vh] border-0 block bg-white"
              onLoad={() => setIframeLoaded(true)}
              referrerPolicy="no-referrer-when-downgrade"
              loading="eager"
            />
          </div>

          <footer className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/15 bg-white/90 text-[10px] text-gray-500 font-body">
            <span>
              Tracking hosted by{' '}
              <a
                href={(VELOCITY_TRACKING_BASE.replace(/\/track\/?$/i, '') || 'https://www.velocityshipping.in')}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-gray-900 hover:underline underline-offset-2"
              >
                Velocity
              </a>
            </span>
            <span className="opacity-70">Hatvoni · Authentic Assam hand crafted items</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
