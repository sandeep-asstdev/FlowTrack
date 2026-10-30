import React, { useState, useEffect, useRef } from 'react';

interface ResendCountdownTimerProps {
  initialCooldownSeconds: number;
  onCooldownEnd?: () => void;
  onResend: () => void;
  isSending?: boolean;
  disabled?: boolean;
  variant?: 'button' | 'text';
}

export const ResendCountdownTimer: React.FC<ResendCountdownTimerProps> = React.memo(({
  initialCooldownSeconds,
  onCooldownEnd,
  onResend,
  isSending = false,
  disabled = false,
  variant = 'button',
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialCooldownSeconds);
  const onCooldownEndRef = useRef(onCooldownEnd);
  onCooldownEndRef.current = onCooldownEnd;

  useEffect(() => {
    setSecondsLeft(initialCooldownSeconds);
  }, [initialCooldownSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onCooldownEndRef.current?.();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          onCooldownEndRef.current?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  if (secondsLeft > 0) {
    if (variant === 'button') {
      return (
        <button
          type="button"
          disabled
          className="px-3 py-2.5 min-h-[44px] text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 transition-colors shrink-0 cursor-not-allowed font-mono"
        >
          Wait ({secondsLeft}s)
        </button>
      );
    }
    return (
      <span className="text-slate-400 font-mono text-[11px] whitespace-nowrap">
        Resend in {secondsLeft}s
      </span>
    );
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={onResend}
        disabled={disabled || isSending}
        className="px-3 py-2.5 min-h-[44px] text-xs font-bold rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
      >
        {isSending ? 'Sending...' : 'Resend code'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onResend}
      disabled={disabled || isSending}
      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 cursor-pointer"
    >
      {isSending ? 'Sending...' : 'Resend code'}
    </button>
  );
});

ResendCountdownTimer.displayName = 'ResendCountdownTimer';

