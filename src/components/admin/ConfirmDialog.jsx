import React from 'react';

export default function ConfirmDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#bec9bf]/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-xl">warning</span>
        </div>
        <h3 className="text-lg font-bold text-[#004a2b] mb-1.5" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{title}</h3>
        <p className="text-sm text-[#3f4942] leading-relaxed mb-6">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-[#3f4942] hover:bg-[#f5f4eb] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 h-10 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
