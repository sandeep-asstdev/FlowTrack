import { describe, it, expect } from 'vitest';
import {
  formatLocalizedCurrency,
  formatLocalizedNumber,
  formatLocalizedDate,
} from './formatters.js';

describe('Locale and Internationalization Formatters', () => {
  describe('formatLocalizedCurrency', () => {
    it('formats USD in en-US correctly', () => {
      const res = formatLocalizedCurrency(100000, 'USD', 'en-US');
      expect(res).toContain('$100,000');
    });

    it('formats INR in hi-IN with Indian numbering grouping (lakhs)', () => {
      const res = formatLocalizedCurrency(100000, 'INR', 'hi-IN');
      // Indian format: 1,00,000
      expect(res).toContain('1,00,000');
    });

    it('formats EUR in de-DE', () => {
      const res = formatLocalizedCurrency(50000, 'EUR', 'de-DE');
      expect(res).toContain('50.000');
    });

    it('returns "Not specified" for null and undefined to avoid inventing false zeros', () => {
      expect(formatLocalizedCurrency(null)).toBe('Not specified');
      expect(formatLocalizedCurrency(undefined)).toBe('Not specified');
    });
  });

  describe('formatLocalizedNumber', () => {
    it('formats numbers according to locale grouping rules', () => {
      const us = formatLocalizedNumber(1234567, 'en-US');
      expect(us).toBe('1,234,567');

      const india = formatLocalizedNumber(1234567, 'en-IN');
      expect(india).toBe('12,34,567');
    });

    it('handles null values safely', () => {
      expect(formatLocalizedNumber(null)).toBe('N/A');
    });
  });

  describe('formatLocalizedDate', () => {
    const isoDate = '2026-10-24T12:00:00Z';

    it('formats dates in specified timezone', () => {
      const formattedUtc = formatLocalizedDate(isoDate, 'UTC', 'en-US');
      expect(formattedUtc).toContain('Oct 24, 2026');

      const formattedTokyo = formatLocalizedDate(isoDate, 'Asia/Tokyo', 'en-US');
      expect(formattedTokyo).toContain('Oct 24, 2026');
    });

    it('handles null and invalid date inputs safely', () => {
      expect(formatLocalizedDate(null)).toBe('None');
      expect(formatLocalizedDate('invalid-date')).toBe('Invalid Date');
    });
  });
});
