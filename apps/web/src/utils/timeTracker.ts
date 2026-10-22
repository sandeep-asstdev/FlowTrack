export interface CountdownResult {
  isOverdue: boolean;
  isUrgent: boolean; // < 24 hours
  isTwoDaysAlert: boolean; // <= 48 hours remaining (2 days)
  isWarning: boolean; // < 3 days
  isDone: boolean;
  formattedText: string;
  badgeClass: string;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
}

export function calculateTimeCountdown(dueDate?: string | null, statusCategory = 'active'): CountdownResult {
  if (statusCategory === 'done') {
    return {
      isOverdue: false,
      isUrgent: false,
      isTwoDaysAlert: false,
      isWarning: false,
      isDone: true,
      formattedText: 'Completed',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
      daysRemaining: 0,
      hoursRemaining: 0,
      minutesRemaining: 0,
    };
  }

  if (!dueDate) {
    return {
      isOverdue: false,
      isUrgent: false,
      isTwoDaysAlert: false,
      isWarning: false,
      isDone: false,
      formattedText: 'No deadline set',
      badgeClass: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      daysRemaining: 999,
      hoursRemaining: 999,
      minutesRemaining: 999,
    };
  }

  const due = new Date(dueDate).getTime();
  const now = Date.now();
  const diffMs = due - now;

  if (diffMs <= 0) {
    // Overdue!
    const overdueMs = Math.abs(diffMs);
    const overdueHours = Math.floor(overdueMs / (1000 * 60 * 60));
    const overdueDays = Math.floor(overdueHours / 24);
    const remHours = overdueHours % 24;

    const formattedText =
      overdueDays > 0
        ? `Overdue by ${overdueDays}d ${remHours}h`
        : overdueHours > 0
          ? `Overdue by ${overdueHours}h`
          : `Overdue by ${Math.floor(overdueMs / (1000 * 60))}m`;

    return {
      isOverdue: true,
      isUrgent: true,
      isTwoDaysAlert: true,
      isWarning: true,
      isDone: false,
      formattedText,
      badgeClass: 'bg-rose-500 text-white font-extrabold shadow-sm animate-pulse',
      daysRemaining: -overdueDays,
      hoursRemaining: -overdueHours,
      minutesRemaining: -Math.floor(overdueMs / (1000 * 60)),
    };
  }

  // Not overdue, countdown to deadline
  const totalMins = Math.floor(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMins / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = totalMins % 60;
  const isTwoDaysAlert = totalHours <= 48;

  if (totalHours < 24) {
    // Urgent: less than 24 hours left
    return {
      isOverdue: false,
      isUrgent: true,
      isTwoDaysAlert: true,
      isWarning: true,
      isDone: false,
      formattedText: `${hours}h ${mins}m left - Complete Soon!`,
      badgeClass: 'bg-amber-500 text-white font-bold animate-pulse',
      daysRemaining: 0,
      hoursRemaining: hours,
      minutesRemaining: mins,
    };
  }

  if (days <= 2 || totalHours <= 48) {
    // 2 Days alert: exactly 48 hours or less
    return {
      isOverdue: false,
      isUrgent: false,
      isTwoDaysAlert: true,
      isWarning: true,
      isDone: false,
      formattedText: `⚠️ Due Soon: ${days}d ${hours}h left`,
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 font-bold animate-pulse',
      daysRemaining: days,
      hoursRemaining: hours,
      minutesRemaining: mins,
    };
  }

  if (days <= 3) {
    // Warning: 1 to 3 days left
    return {
      isOverdue: false,
      isUrgent: false,
      isTwoDaysAlert: false,
      isWarning: true,
      isDone: false,
      formattedText: `${days}d ${hours}h left`,
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 font-semibold',
      daysRemaining: days,
      hoursRemaining: hours,
      minutesRemaining: mins,
    };
  }

  return {
    isOverdue: false,
    isUrgent: false,
    isTwoDaysAlert: false,
    isWarning: false,
    isDone: false,
    formattedText: `${days} days left`,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 font-medium',
    daysRemaining: days,
    hoursRemaining: hours,
    minutesRemaining: mins,
  };
}
