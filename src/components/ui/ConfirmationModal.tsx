import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger'
}: ConfirmationModalProps) {
  const colors = {
    danger: 'bg-red-600 hover:bg-red-700 shadow-red-200',
    warning: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200',
    info: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
  };

  const iconColors = {
    danger: 'text-red-600 bg-red-50',
    warning: 'text-amber-600 bg-amber-50',
    info: 'text-indigo-600 bg-indigo-50'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className={`p-3 rounded-2xl ${iconColors[type]}`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
              <p className="text-slate-600 leading-relaxed mb-8">{message}</p>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 px-6 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${colors[type]}`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
