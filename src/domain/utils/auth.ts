/**
 * Generate a random 6-letter lowercase slug
 * Example: "kmqpzx"
 */
export function generateSlug(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let slug = '';
  for (let i = 0; i < 6; i++) {
    slug += letters[Math.floor(Math.random() * letters.length)];
  }
  return slug;
}

/**
 * Generate a random 6-digit PIN
 * Example: "123456"
 */
export function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if PIN has expired (10 minutes)
 */
export function isPinExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Get PIN expiry time (current time + 10 minutes)
 */
export function getPinExpiryTime(): Date {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Log PIN to console (temporary, will be replaced with email)
 */
export function sendPinToEmail(email: string, pin: string, purpose: 'signup' | 'login'): void {
  console.log('\n' + '='.repeat(60));
  console.log(`📧 EMAIL: ${email}`);
  console.log(`🔐 PIN: ${pin}`);
  console.log(`📋 Purpose: ${purpose.toUpperCase()}`);
  console.log(`⏰ Expires in: 10 minutes`);
  console.log('='.repeat(60) + '\n');
}
