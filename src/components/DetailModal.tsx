'use client';

import { ReactNode } from 'react';

interface DetailModalProps {
  title: string;
  onClose: () => void;
  onEdit?: () => void;
  children: ReactNode;
}

export function DetailModal({ title, onClose, onEdit, children }: DetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-20 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="space-y-3">{children}</div>

        {onEdit && (
          <div className="flex justify-end mt-6 pt-4 border-t border-slate-200">
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5">{value ?? '—'}</div>
    </div>
  );
}
