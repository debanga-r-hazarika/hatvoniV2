import React from 'react';

export default function ConfirmDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
      <div className="bg-surface-container-lowest rounded-[2.5rem] border border-outline-variant/30 max-w-md w-full p-8 shadow-2xl animate-in zoom-in-95 duration-500">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-6">
           <span className="material-symbols-outlined text-3xl font-bold">warning</span>
        </div>
        <h3 className="font-brand text-2xl font-bold text-primary mb-3 tracking-tight">{title}</h3>
        <p className="font-body text-on-surface-variant leading-relaxed mb-8">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-4 rounded-2xl font-brand font-bold text-on-surface-variant hover:bg-surface-container-low transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-6 py-4 rounded-2xl font-brand font-bold text-white transition-all active:scale-95 shadow-lg ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
