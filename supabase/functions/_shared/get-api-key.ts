/**
 * Helper function to get decrypted API keys from the manage-api-keys edge function.
 * 
 * Usage in edge functions:
 * ```typescript
 * import { getApiKey } from "../_shared/get-api-key.ts";
 * 
 * const stripeApiKey = await getApiKey(supabaseUrl, serviceKey, organizationId, 'stripe');
 * if (!stripeApiKey) {
 *   throw new Error('Stripe API key not configured');
 * }
 * ```
 */

export type KeyType = 'calendly' | 'calcom' | 'close' | 'ghl' | 'hubspot' | 'whop' | 'stripe';

export interface GetApiKeyResult {
  apiKey: string;
  wasMigrated?: boolean;
}

/**
 * Fetches a decrypted API key for the given organization and key type.
 * This calls the manage-api-keys edge function which handles encryption/decryption.
 * 
 * @param supabaseUrl - The Supabase project URL
 * @param serviceKey - The Supabase service role key
 * @param organizationId - The organization ID
 * @param keyType - The type of API key to retrieve
 * @param callerFunctionName - Optional name of the calling function for audit logging
 * @returns The decrypted API key or null if not configured
 */
export async function getApiKey(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  keyType: KeyType,
  callerFunctionName?: string
): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/manage-api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'x-function-name': callerFunctionName || 'unknown',
      },
      body: JSON.stringify({
        action: 'decrypt',
        organizationId,
        keyType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Failed to get ${keyType} API key:`, errorData);
      return null;
    }

    const data = await response.json() as GetApiKeyResult;
    
    if (data.wasMigrated) {
      console.log(`API key for ${keyType} was automatically migrated from plaintext to encrypted`);
    }
    
    return data.apiKey || null;
  } catch (error) {
    console.error(`Error fetching ${keyType} API key:`, error);
    return null;
  }
}

/**
 * Convenience wrapper that throws an error if the API key is not configured.
 */
export async function requireApiKey(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  keyType: KeyType,
  callerFunctionName?: string
): Promise<string> {
  const apiKey = await getApiKey(supabaseUrl, serviceKey, organizationId, keyType, callerFunctionName);
  if (!apiKey) {
    throw new Error(`${keyType.toUpperCase()} API key is not configured for this organization`);
  }
  return apiKey;
}
