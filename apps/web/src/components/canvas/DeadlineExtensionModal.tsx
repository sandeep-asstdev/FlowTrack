import React, { useState } from 'react';
import { X, Clock, AlertTriangle, Paperclip, Send } from 'lucide-react';

interface DeadlineExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDueDate: string | null;
  newDueDate?: string;
  pendingDueDate?: string;
  taskTitle?: string;
  onConfirm: (reason: string, revisedDueDate?: string, attachedDoc?: string) => Promise<void>;
}

export const DeadlineExtensionModal: React.FC<DeadlineExtensionModalProps> = ({
  isOpen,
  onClose,
  currentDueDate,
  newDueDate,
  pendingDueDate,
  taskTitle = 'Task Node',
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [attachedDocName, setAttachedDocName] = useState<string | null>(null);
  const [attachedDocData, setAttachedDocData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Initial date for revised deadline
  const targetInitial = pendingDueDate || newDueDate || (currentDueDate ? new Date(new Date(currentDueDate).getTime() + 86400000 * 2).toISOString() : new Date(Date.now() + 86400000 * 2).toISOString());
  const [revisedDate, setRevisedDate] = useState<string>(() => {
    try {
      return targetInitial ? new Date(targetInitial).toISOString().slice(0, 16) : '';
    } catch {
      return '';
    }
  });

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedDocName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachedDocData(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide an official explanation for changing the deadline.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await onConfirm(reason.trim(), revisedDate || undefined, attachedDocData || undefined);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record deadline change');
    } finally {
      setSubmitting(false);
    }
  };

  const oldDateStr = currentDueDate ? new Date(currentDueDate).toLocaleString() : 'Not Set';

  return (
    <div
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[calc(100dvh-2rem)] flex flex-col overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Deadline Extension & Accountability
              </h3>
              <p className="text-[11px] text-slate-400 break-words-safe">
                Audited timeline record for: <span className="font-semibold text-slate-700 dark:text-slate-300">&quot;{taskTitle}&quot;</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close deadline modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Change Comparison with Date and Time Input */}
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-2 text-xs shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">
              Previous Deadline
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{oldDateStr}</span>
          </div>

          <div className="pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
            <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block mb-1">
              New Extended Date &amp; Time <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={revisedDate}
              onChange={(e) => setRevisedDate(e.target.value)}
              className="w-full min-h-[44px] p-2 text-xs rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
            />
          </div>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-600 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="break-words-safe">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
              Reason for Timeline Adjustment / Delay <span className="text-rose-500">*</span>
            </label>
            <p className="text-[11px] text-slate-400 mb-1.5">
              Explain why this deadline was exceeded or changed (e.g. material delay, client scope revision, weather conditions).
            </p>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter comprehensive delay justification..."
              className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 break-words-safe"
            />
          </div>

          {/* Optional Supporting Document / Proof */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Attach Supporting Document (Optional)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5 transition-colors">
                <Paperclip className="w-3.5 h-3.5" />
                <span>{attachedDocName ? 'Change File' : 'Upload Delay Notice / Doc'}</span>
                <input type="file" onChange={handleFileUpload} className="hidden" />
              </label>
              {attachedDocName && (
                <span className="text-xs text-blue-600 dark:text-blue-400 truncate max-w-[200px] break-words-safe">
                  📎 {attachedDocName}
                </span>
              )}
            </div>
          </div>

          <div className="pt-2 flex flex-col-reverse xs:flex-row items-stretch xs:items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="min-h-[44px] px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 flex items-center justify-center gap-1.5 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'Recording Change...' : 'Confirm & Log In History'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
