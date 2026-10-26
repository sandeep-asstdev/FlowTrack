/**
 * FlowTrack Locale and Internationalization Formatters
 * Provides locale-aware, timezone-aware formatting for numbers, currencies, and dates.
 */

/**
 * Format currency with locale awareness (e.g. INR in India displays ₹1,00,000, USD in US displays $100,000).
 * Handles null/undefined gracefully without inventing false zeros.
 */
export function formatLocalizedCurrency(
  val: number | null | undefined,
  currencyCode: string = 'USD',
  locale: string = 'en-US',
  fallbackSymbol?: string
): string {
  if (val === null || val === undefined) {
    return 'Not specified';
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  } catch {
    const symbol = fallbackSymbol || currencyCode;
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
    return `${symbol} ${formatted}`;
  }
}

/**
 * Format numbers with locale awareness (e.g. Indian numbering format vs Western format).
 */
export function formatLocalizedNumber(
  val: number | null | undefined,
  locale: string = 'en-US',
  options?: Intl.NumberFormatOptions
): string {
  if (val === null || val === undefined) {
    return 'N/A';
  }

  return new Intl.NumberFormat(locale, options).format(val);
}

/**
 * Format dates with explicit timezone and locale handling.
 */
export function formatLocalizedDate(
  date: string | Date | null | undefined,
  timeZone: string = 'UTC',
  locale: string = 'en-US',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  if (!date) {
    return 'None';
  }

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone,
    }).format(d);
  } catch {
    // Fallback if timezone string is unknown
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: 'UTC',
    }).format(d);
  }
}
