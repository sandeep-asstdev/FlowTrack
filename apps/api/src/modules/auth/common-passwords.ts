const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password123',
  'password1234',
  'admin123',
  'admin1234',
  'qwerty123',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'flowtrack123',
  'changeme123',
  'iloveyou123',
  'sunshine123',
  'princess123',
  'football123',
  'monkey123',
  'master123',
  'dragon123',
  'trustno1',
]);

/**
 * Checks if a given password is in the common password blocklist.
 */
export function isCommonPassword(password: string): boolean {
  if (!password) return false;
  const clean = password.toLowerCase().trim();
  return COMMON_PASSWORDS.has(clean);
}

