/**
 * Sanitize error messages to prevent information leakage
 * Database errors, RLS violations, and internal errors should not be exposed to users
 */

// Patterns that indicate sensitive error information
const SENSITIVE_PATTERNS = [
  /column.*does not exist/i,
  /relation.*does not exist/i,
  /permission denied/i,
  /violates.*constraint/i,
  /RLS/i,
  /row-level security/i,
  /policy/i,
  /duplicate key/i,
  /foreign key/i,
  /null value in column/i,
  /syntax error/i,
  /PGRST/i,  // PostgREST errors
  /supabase/i,
  /postgres/i,
  /authentication/i,
  /JWT/i,
  /token/i,
];

// Map of known error patterns to user-friendly messages
const ERROR_MAPPINGS: Record<string, string> = {
  'Invalid login credentials': 'Invalid email or password. Please try again.',
  'already registered': 'An account with this email already exists.',
  'Email not confirmed': 'Please check your email to confirm your account.',
  'rate limit': 'Too many requests. Please try again in a moment.',
  'network': 'Network error. Please check your connection.',
  'timeout': 'Request timed out. Please try again.',
};

/**
 * Get a user-safe error message from any error
 * @param error - The error to sanitize
 * @param fallback - Optional custom fallback message
 * @returns A safe error message for display to users
 */
export function getSafeErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred. Please try again.'
): string {
  if (!error) return fallback;

  const message = error instanceof Error ? error.message : String(error);

  // Check for known error patterns with friendly messages
  for (const [pattern, friendlyMessage] of Object.entries(ERROR_MAPPINGS)) {
    if (message.toLowerCase().includes(pattern.toLowerCase())) {
      return friendlyMessage;
    }
  }

  // Check if message contains sensitive information
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(message)) {
      console.error('Sanitized sensitive error:', message); // Log for debugging
      return fallback;
    }
  }

  // If the message is very long (likely a stack trace), sanitize it
  if (message.length > 200) {
    console.error('Sanitized long error:', message);
    return fallback;
  }

  // Return the original message if it appears safe
  return message;
}

/**
 * Log an error securely (for debugging) without exposing to users
 * @param context - Where the error occurred
 * @param error - The error to log
 */
export function logError(context: string, error: unknown): void {
  // In production, you might want to send this to a logging service
  console.error(`[${context}]`, error instanceof Error ? error.message : error);
}
