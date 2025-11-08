import bcrypt from 'bcrypt';
import validator from 'validator';
import { config } from '../../config';
import { logger } from '../../common/logger';

/**
 * Generate a random 6-character alphanumeric slug (uppercase)
 * Example: "KMQ3ZX"
 */
export function generateSlug(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let slug = '';
  for (let i = 0; i < 6; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

/**
 * Generate a random 6-character alphanumeric PIN (uppercase letters and numbers)
 * More secure than numeric-only PINs
 * Example: "A3K9P2"
 */
export function generatePin(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pin = '';
  for (let i = 0; i < config.pin.length; i++) {
    pin += chars[Math.floor(Math.random() * chars.length)];
  }
  return pin;
}

/**
 * Hash a PIN using bcrypt
 * @param pin - Plain text PIN
 * @returns Hashed PIN
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, config.security.bcryptRounds);
}

/**
 * Verify a PIN against its hash
 * @param pin - Plain text PIN
 * @param hashedPin - Hashed PIN from database
 * @returns True if PIN matches
 */
export async function verifyPin(pin: string, hashedPin: string): Promise<boolean> {
  return bcrypt.compare(pin, hashedPin);
}

/**
 * Check if PIN has expired
 */
export function isPinExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Get PIN expiry time (current time + configured minutes)
 */
export function getPinExpiryTime(): Date {
  return new Date(Date.now() + config.pin.expiryMinutes * 60 * 1000);
}

/**
 * Validate email format using validator library
 * More robust than regex
 */
export function isValidEmail(email: string): boolean {
  return validator.isEmail(email) && email.length <= 254;
}

/**
 * Normalize email address
 * - Convert to lowercase
 * - Trim whitespace
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Send PIN to email (console log for now, will be replaced with email service)
 * In production, this should use a proper email service (SendGrid, AWS SES, etc.)
 */
export function sendPinToEmail(
  email: string,
  pin: string,
  purpose: 'signup' | 'login'
): void {
  // In development, log to console
  if (config.nodeEnv !== 'production') {
    console.log('\n' + '='.repeat(60));
    console.log(`📧 EMAIL: ${email}`);
    console.log(`🔐 PIN: ${pin}`);
    console.log(`📋 Purpose: ${purpose.toUpperCase()}`);
    console.log(`⏰ Expires in: ${config.pin.expiryMinutes} minutes`);
    console.log('='.repeat(60) + '\n');
  }

  // Log for audit trail (without exposing PIN)
  logger.info('PIN sent', {
    email,
    purpose,
    expiryMinutes: config.pin.expiryMinutes,
  });

  // TODO: Implement actual email sending
  // Example:
  // await emailService.send({
  //   to: email,
  //   subject: `Your ${purpose} PIN`,
  //   template: 'pin-email',
  //   data: { pin, expiryMinutes: config.pin.expiryMinutes }
  // });
}

/**
 * Generate a secure random API key
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}
